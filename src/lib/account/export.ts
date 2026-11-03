import { prisma } from "@/lib/db";
import { PlayerNotFoundError } from "@/lib/players/errors";
import type { GroupRole } from "@/lib/auth/roles";

export type AccountExport = {
  exportedAt: string;
  account: {
    id: string;
    name: string;
    email: string;
    username: string | null;
    createdAt: string;
  };
  memberships: { group: string; role: GroupRole; joinedAt: string; removedAt: string | null }[];
  participations: { date: string; group: string; attendance: string }[];
  matches: {
    date: string;
    group: string;
    matchNumber: number;
    team1: [string, string];
    team2: [string, string];
    team1Score: number | null;
    team2Score: number | null;
  }[];
  jokers: {
    date: string;
    group: string;
    season: string;
    pointsCredited: string;
    gamesCredited: number;
  }[];
  auditLogs: {
    action: string;
    entityType: string;
    entityId: string;
    createdAt: string;
    payload: unknown;
  }[];
  avatar: { mimeType: string; base64: string } | null;
};

const gameDaySelect = { select: { date: true, group: { select: { name: true } } } } as const;
const nameSelect = { select: { name: true } } as const;

export async function buildAccountExport(playerId: string): Promise<AccountExport> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      createdAt: true,
      deletedAt: true,
      avatarData: true,
      avatarMimeType: true,
      memberships: {
        orderBy: { joinedAt: "asc" },
        select: {
          role: true,
          joinedAt: true,
          removedAt: true,
          group: { select: { name: true } },
        },
      },
      participations: {
        orderBy: { gameDay: { date: "asc" } },
        select: { attendance: true, gameDay: gameDaySelect },
      },
      jokersUsed: {
        orderBy: { gameDay: { date: "asc" } },
        select: {
          pointsCredited: true,
          gamesCredited: true,
          season: { select: { name: true } },
          gameDay: gameDaySelect,
        },
      },
      auditLogs: {
        orderBy: { createdAt: "asc" },
        select: {
          action: true,
          entityType: true,
          entityId: true,
          createdAt: true,
          payload: true,
        },
      },
    },
  });
  if (!player || player.deletedAt) throw new PlayerNotFoundError(playerId);

  const matches = await prisma.match.findMany({
    where: {
      OR: [
        { team1PlayerAId: playerId },
        { team1PlayerBId: playerId },
        { team2PlayerAId: playerId },
        { team2PlayerBId: playerId },
      ],
    },
    orderBy: [{ gameDay: { date: "asc" } }, { matchNumber: "asc" }],
    include: {
      gameDay: gameDaySelect,
      team1PlayerA: nameSelect,
      team1PlayerB: nameSelect,
      team2PlayerA: nameSelect,
      team2PlayerB: nameSelect,
    },
  });

  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: player.id,
      name: player.name,
      email: player.email,
      username: player.username,
      createdAt: player.createdAt.toISOString(),
    },
    memberships: player.memberships.map((m) => ({
      group: m.group.name,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
      removedAt: m.removedAt?.toISOString() ?? null,
    })),
    participations: player.participations.map((p) => ({
      date: p.gameDay.date.toISOString(),
      group: p.gameDay.group.name,
      attendance: p.attendance,
    })),
    matches: matches.map((m) => ({
      date: m.gameDay.date.toISOString(),
      group: m.gameDay.group.name,
      matchNumber: m.matchNumber,
      team1: [m.team1PlayerA.name, m.team1PlayerB.name],
      team2: [m.team2PlayerA.name, m.team2PlayerB.name],
      team1Score: m.team1Score,
      team2Score: m.team2Score,
    })),
    jokers: player.jokersUsed.map((j) => ({
      date: j.gameDay.date.toISOString(),
      group: j.gameDay.group.name,
      season: j.season.name,
      pointsCredited: j.pointsCredited.toString(),
      gamesCredited: j.gamesCredited,
    })),
    auditLogs: player.auditLogs.map((a) => ({
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      createdAt: a.createdAt.toISOString(),
      payload: a.payload,
    })),
    avatar:
      player.avatarData && player.avatarMimeType
        ? {
            mimeType: player.avatarMimeType,
            base64: Buffer.from(player.avatarData).toString("base64"),
          }
        : null,
  };
}
