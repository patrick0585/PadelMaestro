import type { ParticipantAttendance, RosterRow } from "@/app/admin/participants-roster";
import { prisma } from "@/lib/db";
import { listActiveMembers } from "@/lib/group/members";
import { computeGameDaySummary } from "@/lib/game-day/summary";
import { getGroupRules, type GroupRules } from "@/lib/group/rules";
import { getOrCreateActiveSeason } from "@/lib/season";

export type ParticipantWithPlayer = {
  playerId: string;
  attendance: ParticipantAttendance;
  player: { id: string; name: string };
};

export function buildRosterRows(
  participants: ParticipantWithPlayer[],
  activePlayers: { id: string; name: string }[],
  jokersRemainingByPlayer: Map<string, number>,
): RosterRow[] {
  const byId = new Map(participants.map((p) => [p.playerId, p]));
  return activePlayers
    .map((player) => {
      const participant = byId.get(player.id);
      const attendance: ParticipantAttendance =
        participant?.attendance === "confirmed" ||
        participant?.attendance === "declined" ||
        participant?.attendance === "joker"
          ? participant.attendance
          : "pending";
      return {
        playerId: player.id,
        name: player.name,
        attendance,
        jokersRemaining: jokersRemainingByPlayer.get(player.id) ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export interface OpenGameDay {
  id: string;
  date: Date;
  startTime: string | null;
  status: "planned" | "in_progress";
  confirmed: number;
  total: number;
}

export interface RecentGameDay {
  id: string;
  date: Date;
  winners: string[];
}

const RECENT_LIMIT = 3;

export async function listAdminGameDays(
  groupId: string,
): Promise<{ open: OpenGameDay[]; recent: RecentGameDay[] }> {
  const [memberships, openDays, finished] = await Promise.all([
    prisma.membership.findMany({ where: { groupId, removedAt: null }, select: { playerId: true } }),
    prisma.gameDay.findMany({
      where: { groupId, status: { in: ["planned", "in_progress"] } },
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        startTime: true,
        status: true,
        participants: { select: { playerId: true, attendance: true } },
      },
    }),
    prisma.gameDay.findMany({
      where: { groupId, status: "finished" },
      orderBy: { date: "desc" },
      take: RECENT_LIMIT,
      select: { id: true, date: true },
    }),
  ]);

  const memberIds = new Set(memberships.map((m) => m.playerId));
  const open: OpenGameDay[] = openDays
    .map((d) => ({
      id: d.id,
      date: d.date,
      startTime: d.startTime,
      status: d.status === "in_progress" ? ("in_progress" as const) : ("planned" as const),
      confirmed: d.participants.filter(
        (p) => memberIds.has(p.playerId) && p.attendance === "confirmed",
      ).length,
      total: memberIds.size,
    }))
    .sort((a, b) => Number(b.status === "in_progress") - Number(a.status === "in_progress"));

  const recent = await Promise.all(
    finished.map(async (d) => {
      const summary = await computeGameDaySummary(d.id);
      const winners = (summary?.rows ?? []).filter((r) => r.rank === 1).map((r) => r.playerName);
      return { id: d.id, date: d.date, winners };
    }),
  );

  return { open, recent };
}

export type PlannedGameDayResult =
  | {
      kind: "planned";
      id: string;
      date: Date;
      startTime: string | null;
      roster: RosterRow[];
      rules: GroupRules;
    }
  | { kind: "redirect"; to: string }
  | null;

export async function loadPlannedGameDay(
  groupId: string,
  id: string,
): Promise<PlannedGameDayResult> {
  const day = await prisma.gameDay.findFirst({
    where: { id, groupId },
    include: {
      participants: {
        include: { player: { select: { id: true, name: true } } },
        orderBy: { player: { name: "asc" } },
      },
    },
  });
  if (!day) return null;
  if (day.status === "finished") return { kind: "redirect", to: `/archive/${day.id}` };
  if (day.status === "in_progress") return { kind: "redirect", to: "/game-day" };

  const [players, season, rules] = await Promise.all([
    listActiveMembers(groupId),
    getOrCreateActiveSeason(groupId),
    getGroupRules(groupId),
  ]);
  const jokerCounts = await prisma.jokerUse.groupBy({
    by: ["playerId"],
    where: { seasonId: season.id },
    _count: { _all: true },
  });
  const usedById = new Map(jokerCounts.map((j) => [j.playerId, j._count._all]));
  const remaining = new Map<string, number>(
    players.map((p) => [p.id, Math.max(0, rules.jokersPerSeason - (usedById.get(p.id) ?? 0))]),
  );
  return {
    kind: "planned",
    id: day.id,
    date: day.date,
    startTime: day.startTime,
    roster: buildRosterRows(day.participants, players, remaining),
    rules,
  };
}
