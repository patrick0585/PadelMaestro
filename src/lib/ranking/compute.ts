import { prisma } from "@/lib/db";
import { computeGameDaySummary } from "@/lib/game-day/summary";

export interface RankingRow {
  rank: number;
  playerId: string;
  playerName: string;
  avatarVersion: number;
  games: number;
  points: number;
  pointsPerGame: number;
  jokersUsed: number;
  medals: { gold: number; silver: number; bronze: number };
}

type MedalKind = "gold" | "silver" | "bronze";
type MedalCounts = { gold: number; silver: number; bronze: number };

// Reuses computeGameDaySummary so medal counts always match the per-player
// season stats path — both share the same de-locale-aware tie-breaker on the
// podium.
async function computeMedalsBySeason(
  seasonId: string,
): Promise<Map<string, MedalCounts>> {
  const finishedDays = await prisma.gameDay.findMany({
    where: { seasonId, status: "finished" },
    select: { id: true },
  });
  const summaries = await Promise.all(
    finishedDays.map((d) => computeGameDaySummary(d.id)),
  );
  const medalsByPlayer = new Map<string, MedalCounts>();
  const bump = (playerId: string, kind: MedalKind) => {
    const cur = medalsByPlayer.get(playerId) ?? { gold: 0, silver: 0, bronze: 0 };
    cur[kind] += 1;
    medalsByPlayer.set(playerId, cur);
  };
  for (const s of summaries) {
    if (!s) continue;
    if (s.podium[0]) bump(s.podium[0].playerId, "gold");
    if (s.podium[1]) bump(s.podium[1].playerId, "silver");
    if (s.podium[2]) bump(s.podium[2].playerId, "bronze");
  }
  return medalsByPlayer;
}

export async function computeRanking(seasonId: string): Promise<RankingRow[]> {
  const [rows, medalsByPlayer] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        player_id: string;
        player_name: string;
        avatar_version: number;
        games: bigint;
        points: number;
        jokers_used: bigint;
      }>
    >`
    WITH played AS (
      SELECT p.id AS player_id, p.name AS player_name,
        CASE
          WHEN p.id IN (m."team1PlayerAId", m."team1PlayerBId")
            THEN m."team1Score"
          ELSE m."team2Score"
        END AS points
      FROM "Player" p
      JOIN "Match" m
        ON p.id IN (m."team1PlayerAId", m."team1PlayerBId",
                    m."team2PlayerAId", m."team2PlayerBId")
      JOIN "GameDay" gd ON gd.id = m."gameDayId"
      WHERE gd."seasonId" = ${seasonId}
        AND m."team1Score" IS NOT NULL
        AND p."deletedAt" IS NULL
    ),
    jokers AS (
      SELECT j."playerId" AS player_id,
             SUM(j."gamesCredited")::int AS games_credited,
             SUM(j."pointsCredited")::float AS points_credited,
             COUNT(*)::bigint AS jokers_used
      FROM "JokerUse" j
      WHERE j."seasonId" = ${seasonId}
      GROUP BY j."playerId"
    )
    SELECT
      p.id AS player_id,
      p.name AS player_name,
      p."avatarVersion" AS avatar_version,
      COALESCE(COUNT(played.points), 0)::bigint + COALESCE(j.games_credited, 0)::bigint AS games,
      COALESCE(SUM(played.points), 0)::float + COALESCE(j.points_credited, 0)::float AS points,
      COALESCE(j.jokers_used, 0)::bigint AS jokers_used
    FROM "Player" p
    LEFT JOIN played ON played.player_id = p.id
    LEFT JOIN jokers j ON j.player_id = p.id
    WHERE p."deletedAt" IS NULL
      AND (played.points IS NOT NULL OR j.jokers_used IS NOT NULL)
    GROUP BY p.id, p.name, p."avatarVersion", j.games_credited, j.points_credited, j.jokers_used
    ORDER BY points DESC,
    (
      (COALESCE(SUM(played.points), 0)::float + COALESCE(j.points_credited, 0)::float)
      / NULLIF(
          COALESCE(COUNT(played.points), 0)::float + COALESCE(j.games_credited, 0)::float,
          0
        )
    ) DESC NULLS LAST
  `,
    computeMedalsBySeason(seasonId),
  ]);

  return rows.map((r, i) => {
    const games = Number(r.games);
    const points = Number(r.points);
    return {
      rank: i + 1,
      playerId: r.player_id,
      playerName: r.player_name,
      avatarVersion: Number(r.avatar_version),
      games,
      points,
      pointsPerGame: games === 0 ? 0 : points / games,
      jokersUsed: Number(r.jokers_used),
      medals: medalsByPlayer.get(r.player_id) ?? { gold: 0, silver: 0, bronze: 0 },
    };
  });
}
