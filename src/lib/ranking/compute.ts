import { prisma } from "@/lib/db";
import { getSeasonGroupId } from "@/lib/group/season-group";
import { computeGameDaySummary } from "@/lib/game-day/summary";
import { MEDAL_BY_RANK, type MedalKind } from "@/lib/game-day/competition-rank";
import { sharedRanks } from "./standing";

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

/** A ranking row without the medal counts (those cost one summary per finished day). */
export type StandingRow = Omit<RankingRow, "medals">;

type MedalCounts = { gold: number; silver: number; bronze: number };

// Reuses computeGameDaySummary so medal counts always match the per-player
// season stats path — both read the same ranks off the podium
// (tied players share a medal).
async function computeMedalsBySeason(seasonId: string): Promise<Map<string, MedalCounts>> {
  const finishedDays = await prisma.gameDay.findMany({
    where: { seasonId, status: "finished" },
    select: { id: true },
  });
  const summaries = await Promise.all(finishedDays.map((d) => computeGameDaySummary(d.id)));
  const medalsByPlayer = new Map<string, MedalCounts>();
  const bump = (playerId: string, kind: MedalKind) => {
    const cur = medalsByPlayer.get(playerId) ?? { gold: 0, silver: 0, bronze: 0 };
    cur[kind] += 1;
    medalsByPlayer.set(playerId, cur);
  };
  for (const s of summaries) {
    if (!s) continue;
    for (const r of s.podium) {
      const kind = MEDAL_BY_RANK[r.rank];
      if (kind) bump(r.playerId, kind);
    }
  }
  return medalsByPlayer;
}

export async function computeStandings(seasonId: string): Promise<StandingRow[]> {
  const groupId = await getSeasonGroupId(seasonId);
  const rows = await prisma.$queryRaw<
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
      JOIN "Membership" ms
        ON ms."playerId" = p.id AND ms."groupId" = ${groupId} AND ms."removedAt" IS NULL
      JOIN "Match" m
        ON p.id IN (m."team1PlayerAId", m."team1PlayerBId",
                    m."team2PlayerAId", m."team2PlayerBId")
      JOIN "GameDay" gd ON gd.id = m."gameDayId"
      WHERE gd."seasonId" = ${seasonId}
        AND m."team1Score" IS NOT NULL
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
    JOIN "Membership" ms
      ON ms."playerId" = p.id AND ms."groupId" = ${groupId} AND ms."removedAt" IS NULL
    LEFT JOIN played ON played.player_id = p.id
    LEFT JOIN jokers j ON j.player_id = p.id
    WHERE (played.points IS NOT NULL OR j.jokers_used IS NOT NULL)
    GROUP BY p.id, p.name, p."avatarVersion", j.games_credited, j.points_credited, j.jokers_used
    ORDER BY points DESC,
    (
      (COALESCE(SUM(played.points), 0)::float + COALESCE(j.points_credited, 0)::float)
      / NULLIF(
          COALESCE(COUNT(played.points), 0)::float + COALESCE(j.games_credited, 0)::float,
          0
        )
    ) DESC NULLS LAST,
    p.id COLLATE "C" ASC
  `;

  const ranks = sharedRanks(
    rows.map((r) => ({ points: Number(r.points), games: Number(r.games) })),
  );
  return rows.map((r, i) => {
    const games = Number(r.games);
    const points = Number(r.points);
    return {
      rank: ranks[i],
      playerId: r.player_id,
      playerName: r.player_name,
      avatarVersion: Number(r.avatar_version),
      games,
      points,
      pointsPerGame: games === 0 ? 0 : points / games,
      jokersUsed: Number(r.jokers_used),
    };
  });
}

export async function computeRanking(seasonId: string): Promise<RankingRow[]> {
  const [standings, medalsByPlayer] = await Promise.all([
    computeStandings(seasonId),
    computeMedalsBySeason(seasonId),
  ]);
  return standings.map((r) => ({
    ...r,
    medals: medalsByPlayer.get(r.playerId) ?? { gold: 0, silver: 0, bronze: 0 },
  }));
}
