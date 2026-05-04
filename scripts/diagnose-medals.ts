import { prisma } from "../src/lib/db";
import { computeGameDaySummary } from "../src/lib/game-day/summary";

interface MedalEntry {
  rank: 1 | 2 | 3;
  gameDayId: string;
  date: Date;
  myPoints: number;
  myMatches: number;
  topThree: { rank: number; name: string; points: number; matches: number }[];
}

async function diagnose(identifier: string | "--all") {
  const activeSeason = await prisma.season.findFirst({ where: { isActive: true } });
  if (!activeSeason) {
    console.error("(!) No active season found.");
    process.exit(1);
  }
  console.log(`Active season: ${activeSeason.year} (${activeSeason.id})`);

  const finishedDays = await prisma.gameDay.findMany({
    where: { seasonId: activeSeason.id, status: "finished" },
    select: { id: true, date: true },
    orderBy: { date: "asc" },
  });
  console.log(`Finished game days: ${finishedDays.length}\n`);

  const summaries = await Promise.all(
    finishedDays.map((d) => computeGameDaySummary(d.id)),
  );

  let targets: { id: string; name: string }[];
  if (identifier === "--all") {
    const players = await prisma.player.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    targets = players;
  } else {
    const player = await prisma.player.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier.toLowerCase() },
          { name: { equals: identifier, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true },
    });
    if (!player) {
      console.error(`No player found matching "${identifier}".`);
      process.exit(1);
    }
    targets = [player];
  }

  for (const target of targets) {
    const entries: MedalEntry[] = [];
    for (const s of summaries) {
      if (!s) continue;
      const idx = s.podium.findIndex((r) => r.playerId === target.id);
      if (idx < 0) continue;
      const myRow = s.podium[idx];
      entries.push({
        rank: (idx + 1) as 1 | 2 | 3,
        gameDayId: s.gameDayId,
        date: s.date,
        myPoints: myRow.points,
        myMatches: myRow.matches,
        topThree: s.podium.map((r, i) => ({
          rank: i + 1,
          name: r.playerName,
          points: r.points,
          matches: r.matches,
        })),
      });
    }

    const tally = { gold: 0, silver: 0, bronze: 0 };
    for (const e of entries) {
      if (e.rank === 1) tally.gold += 1;
      else if (e.rank === 2) tally.silver += 1;
      else tally.bronze += 1;
    }

    if (identifier === "--all" && entries.length === 0) continue;

    console.log("=".repeat(72));
    console.log(`Player: ${target.name} (${target.id})`);
    console.log(`Medals: gold=${tally.gold}  silver=${tally.silver}  bronze=${tally.bronze}`);
    if (entries.length === 0) {
      console.log("(no podium finishes in this season)\n");
      continue;
    }
    console.log("");
    for (const e of entries) {
      const medal = e.rank === 1 ? "GOLD  " : e.rank === 2 ? "SILVER" : "BRONZE";
      const dateStr = e.date.toISOString().slice(0, 10);
      console.log(
        `${medal}  ${dateStr}  pts=${e.myPoints}  matches=${e.myMatches}  (gameDayId=${e.gameDayId})`,
      );
      for (const r of e.topThree) {
        const marker = r.rank === e.rank ? " <-" : "   ";
        console.log(
          `        ${r.rank}.  ${r.name.padEnd(24)} pts=${String(r.points).padStart(3)}  matches=${String(r.matches).padStart(2)}${marker}`,
        );
      }
      console.log("");
    }
  }
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error(
      "Usage: pnpm tsx scripts/diagnose-medals.ts <email-or-name-or-username | --all>",
    );
    console.error("Set DATABASE_URL to the prod DB when diagnosing production issues.");
    process.exit(1);
  }
  try {
    await diagnose(arg);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
