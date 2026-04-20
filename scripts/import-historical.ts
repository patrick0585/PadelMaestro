import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { getOrCreateActiveSeason } from "../src/lib/season";

interface HistoricalGameDay {
  date: string;
  playerCount: 4 | 5 | 6;
  matches: Array<{
    matchNumber: number;
    team1: [string, string];
    team2: [string, string];
    team1Score: number;
    team2Score: number;
  }>;
}

interface HistoricalExport {
  players: Array<{ name: string; email: string }>;
  gameDays: HistoricalGameDay[];
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: pnpm import:historical <path-to-export.json>");
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(path, "utf-8")) as HistoricalExport;
  const season = await getOrCreateActiveSeason();

  const playerByName = new Map<string, string>();
  for (const raw of data.players) {
    const p = await prisma.player.upsert({
      where: { email: raw.email },
      create: { name: raw.name, email: raw.email, passwordHash: null },
      update: { name: raw.name },
    });
    playerByName.set(raw.name, p.id);
  }

  for (const gd of data.gameDays) {
    const day = await prisma.gameDay.create({
      data: {
        seasonId: season.id,
        date: new Date(gd.date),
        playerCount: gd.playerCount,
        status: "finished",
      },
    });
    for (const m of gd.matches) {
      await prisma.match.create({
        data: {
          gameDayId: day.id,
          matchNumber: m.matchNumber,
          team1PlayerAId: must(playerByName.get(m.team1[0]), m.team1[0]),
          team1PlayerBId: must(playerByName.get(m.team1[1]), m.team1[1]),
          team2PlayerAId: must(playerByName.get(m.team2[0]), m.team2[0]),
          team2PlayerBId: must(playerByName.get(m.team2[1]), m.team2[1]),
          team1Score: m.team1Score,
          team2Score: m.team2Score,
        },
      });
    }
    console.log(`Imported ${gd.date}: ${gd.matches.length} matches`);
  }
}

function must(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Unknown player: ${name}`);
  return value;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
