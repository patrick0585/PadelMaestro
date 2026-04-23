import { prisma } from "@/lib/db";

export const MAX_JOKERS_PER_SEASON = 2;
export const JOKER_GAMES_CREDITED = 10;

export class JokerLockedError extends Error {
  constructor(message = "Game day is locked; Joker can no longer be used") {
    super(message);
    this.name = "JokerLockedError";
  }
}

export class JokerCapExceededError extends Error {
  constructor(message = `Max ${MAX_JOKERS_PER_SEASON} Jokers per season already used`) {
    super(message);
    this.name = "JokerCapExceededError";
  }
}

export class JokerNotFoundError extends Error {
  constructor(message = "No Joker set for this player on this game day") {
    super(message);
    this.name = "JokerNotFoundError";
  }
}

async function snapshotPpg(playerId: string, seasonId: string): Promise<number> {
  const rows = await prisma.$queryRaw<
    Array<{ games: bigint; points: number | null }>
  >`
    SELECT
      COUNT(*)::bigint AS games,
      COALESCE(SUM(
        CASE
          WHEN ${playerId} IN (m."team1PlayerAId", m."team1PlayerBId")
            THEN m."team1Score"
          ELSE m."team2Score"
        END
      ), 0)::float AS points
    FROM "Match" m
    JOIN "GameDay" gd ON gd.id = m."gameDayId"
    WHERE gd."seasonId" = ${seasonId}
      AND m."team1Score" IS NOT NULL
      AND ${playerId} IN (m."team1PlayerAId", m."team1PlayerBId",
                          m."team2PlayerAId", m."team2PlayerBId")
  `;
  const games = Number(rows[0]?.games ?? 0);
  const points = Number(rows[0]?.points ?? 0);
  return games === 0 ? 0 : points / games;
}

async function recordJokerUseInternal(args: {
  actorId: string;
  playerId: string;
  gameDayId: string;
  auditAction: "joker.use" | "joker.use.admin";
}) {
  const gameDay = await prisma.gameDay.findUniqueOrThrow({
    where: { id: args.gameDayId },
    select: { id: true, status: true, seasonId: true },
  });
  if (gameDay.status !== "planned") throw new JokerLockedError();

  const ppg = await snapshotPpg(args.playerId, gameDay.seasonId);
  const points = ppg * JOKER_GAMES_CREDITED;

  return prisma.$transaction(async (tx) => {
    // Serialise concurrent joker creates for the same (player, season) so the
    // cap check below sees all committed joker uses. Released when the tx ends.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${args.playerId}), hashtext(${gameDay.seasonId}))`;

    const existing = await tx.jokerUse.count({
      where: { playerId: args.playerId, seasonId: gameDay.seasonId },
    });
    if (existing >= MAX_JOKERS_PER_SEASON) throw new JokerCapExceededError();

    const use = await tx.jokerUse.create({
      data: {
        playerId: args.playerId,
        seasonId: gameDay.seasonId,
        gameDayId: args.gameDayId,
        ppgAtUse: ppg.toFixed(3),
        gamesCredited: JOKER_GAMES_CREDITED,
        pointsCredited: points.toFixed(2),
      },
    });
    await tx.gameDayParticipant.update({
      where: {
        gameDayId_playerId: { gameDayId: args.gameDayId, playerId: args.playerId },
      },
      data: { attendance: "joker", respondedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: args.actorId,
        action: args.auditAction,
        entityType: "JokerUse",
        entityId: use.id,
        payload: {
          ppg,
          points,
          gameDayId: args.gameDayId,
          seasonId: gameDay.seasonId,
          targetPlayerId: args.playerId,
        },
      },
    });
    return use;
  });
}

export async function recordJokerUse(args: { playerId: string; gameDayId: string }) {
  return recordJokerUseInternal({
    actorId: args.playerId,
    playerId: args.playerId,
    gameDayId: args.gameDayId,
    auditAction: "joker.use",
  });
}

export async function recordJokerUseAsAdmin(args: {
  actorId: string;
  playerId: string;
  gameDayId: string;
}) {
  return recordJokerUseInternal({ ...args, auditAction: "joker.use.admin" });
}

async function cancelJokerUseInternal(args: {
  actorId: string;
  playerId: string;
  gameDayId: string;
  auditAction: "joker.cancel" | "joker.cancel.admin";
}): Promise<void> {
  const gameDay = await prisma.gameDay.findUniqueOrThrow({
    where: { id: args.gameDayId },
    select: { id: true, status: true, seasonId: true },
  });
  if (gameDay.status !== "planned") throw new JokerLockedError();

  const existing = await prisma.jokerUse.findUnique({
    where: {
      playerId_seasonId_gameDayId: {
        playerId: args.playerId,
        seasonId: gameDay.seasonId,
        gameDayId: args.gameDayId,
      },
    },
  });
  if (!existing) throw new JokerNotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.jokerUse.delete({ where: { id: existing.id } });
    await tx.gameDayParticipant.update({
      where: {
        gameDayId_playerId: { gameDayId: args.gameDayId, playerId: args.playerId },
      },
      data: { attendance: "pending", respondedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: args.actorId,
        action: args.auditAction,
        entityType: "JokerUse",
        entityId: existing.id,
        payload: {
          gameDayId: args.gameDayId,
          seasonId: gameDay.seasonId,
          targetPlayerId: args.playerId,
          ppgAtUse: Number(existing.ppgAtUse),
          pointsCredited: Number(existing.pointsCredited),
        },
      },
    });
  });
}

export async function cancelJokerUse(args: {
  playerId: string;
  gameDayId: string;
}): Promise<void> {
  return cancelJokerUseInternal({
    actorId: args.playerId,
    playerId: args.playerId,
    gameDayId: args.gameDayId,
    auditAction: "joker.cancel",
  });
}

export async function cancelJokerUseAsAdmin(args: {
  actorId: string;
  playerId: string;
  gameDayId: string;
}): Promise<void> {
  return cancelJokerUseInternal({ ...args, auditAction: "joker.cancel.admin" });
}
