import { prisma } from "@/lib/db";
import { getOrCreateActiveSeason } from "@/lib/season";

export type AdminOverviewHero =
  | { kind: "running"; id: string; date: Date }
  | {
      kind: "planned";
      id: string;
      date: Date;
      startTime: string | null;
      confirmed: number;
      declined: number;
      joker: number;
      total: number;
      pending: number;
    }
  | { kind: "none" };

export interface AdminOverview {
  hero: AdminOverviewHero;
  seasonName: string;
  seasonStart: Date;
  finishedCount: number;
  plannedCount: number;
  memberCount: number;
  openInvitationCount: number;
  groupName: string;
}

export async function loadAdminOverview(groupId: string): Promise<AdminOverview> {
  const season = await getOrCreateActiveSeason(groupId);
  const now = new Date();

  const [group, memberships, running, nextPlanned, finishedCount, plannedCount, invitations] =
    await Promise.all([
      prisma.group.findUniqueOrThrow({ where: { id: groupId }, select: { name: true } }),
      prisma.membership.findMany({
        where: { groupId, removedAt: null },
        select: { playerId: true },
      }),
      prisma.gameDay.findFirst({
        where: { groupId, status: "in_progress" },
        orderBy: { date: "desc" },
        select: { id: true, date: true },
      }),
      prisma.gameDay.findFirst({
        where: { groupId, status: "planned" },
        orderBy: { date: "asc" },
        select: {
          id: true,
          date: true,
          startTime: true,
          participants: { select: { playerId: true, attendance: true } },
        },
      }),
      prisma.gameDay.count({ where: { seasonId: season.id, status: "finished" } }),
      prisma.gameDay.count({ where: { groupId, status: "planned" } }),
      prisma.invitation.findMany({
        where: { groupId, kind: "member", revokedAt: null, expiresAt: { gt: now } },
        select: { usedCount: true, maxUses: true },
      }),
    ]);

  const memberIds = new Set(memberships.map((m) => m.playerId));
  const total = memberIds.size;

  let hero: AdminOverviewHero = { kind: "none" };
  if (running) {
    hero = { kind: "running", id: running.id, date: running.date };
  } else if (nextPlanned) {
    const responded = nextPlanned.participants.filter((p) => memberIds.has(p.playerId));
    const confirmed = responded.filter((p) => p.attendance === "confirmed").length;
    const declined = responded.filter((p) => p.attendance === "declined").length;
    const joker = responded.filter((p) => p.attendance === "joker").length;
    const answered = responded.filter((p) => p.attendance !== "pending").length;
    hero = {
      kind: "planned",
      id: nextPlanned.id,
      date: nextPlanned.date,
      startTime: nextPlanned.startTime,
      confirmed,
      declined,
      joker,
      total,
      pending: total - answered,
    };
  }

  return {
    hero,
    seasonName: season.name,
    seasonStart: season.startDate,
    finishedCount,
    plannedCount,
    memberCount: total,
    openInvitationCount: invitations.filter((i) => i.usedCount < i.maxUses).length,
    groupName: group.name,
  };
}
