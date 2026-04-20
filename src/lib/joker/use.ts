import { prisma } from "@/lib/db";

export const MAX_JOKERS_PER_SEASON = 2;
export const JOKER_GAMES_CREDITED = 10;

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

export async function useJoker(args: { playerId: string; gameDayId: string }) {
  const gameDay = await prisma.gameDay.findUniqueOrThrow({
    where: { id: args.gameDayId },
    include: { season: true },
  });
  if (gameDay.status !== "planned") {
    throw new Error("Game day is locked; Joker can no longer be used");
  }

  const existing = await prisma.jokerUse.count({
    where: { playerId: args.playerId, seasonId: gameDay.seasonId },
  });
  if (existing >= MAX_JOKERS_PER_SEASON) {
    throw new Error(`Max ${MAX_JOKERS_PER_SEASON} Jokers per season already used`);
  }

  const ppg = await snapshotPpg(args.playerId, gameDay.seasonId);
  const points = ppg * JOKER_GAMES_CREDITED;

  return prisma.$transaction(async (tx) => {
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
        actorId: args.playerId,
        action: "joker.use",
        entityType: "JokerUse",
        entityId: use.id,
        payload: { ppg, points, gameDayId: args.gameDayId },
      },
    });
    return use;
  });
}
