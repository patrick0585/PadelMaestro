import { writeFileSync } from "node:fs";
import { prisma } from "../../src/lib/db";
import { computeRanking } from "../../src/lib/ranking/compute";
import { buildSeasonTrend } from "../../src/lib/ranking/season-trend";
import { computePlayerSeasonStats } from "../../src/lib/player/season-stats";

async function playerIdsOfSeason(seasonId: string): Promise<string[]> {
  const [matches, jokers] = await Promise.all([
    prisma.match.findMany({
      where: { gameDay: { seasonId } },
      select: {
        team1PlayerAId: true,
        team1PlayerBId: true,
        team2PlayerAId: true,
        team2PlayerBId: true,
      },
    }),
    prisma.jokerUse.findMany({ where: { seasonId }, select: { playerId: true } }),
  ]);
  const ids = new Set<string>(jokers.map((j) => j.playerId));
  for (const m of matches) {
    ids.add(m.team1PlayerAId);
    ids.add(m.team1PlayerBId);
    ids.add(m.team2PlayerAId);
    ids.add(m.team2PlayerBId);
  }
  return [...ids].sort();
}

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("Usage: tenancy-snapshot.ts <out.json>");

  const seasons = await prisma.season.findMany({
    orderBy: [{ year: "asc" }, { name: "asc" }],
  });

  const result = [];
  for (const season of seasons) {
    const ranking = await computeRanking(season.id);
    const trend = await buildSeasonTrend(season.id);
    const stats: Record<string, unknown> = {};
    for (const playerId of await playerIdsOfSeason(season.id)) {
      stats[playerId] = await computePlayerSeasonStats(playerId, season.id);
    }
    result.push({ id: season.id, name: season.name, ranking, trend, stats });
  }

  writeFileSync(out, JSON.stringify({ seasons: result }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
