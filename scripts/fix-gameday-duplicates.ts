import { prisma } from "../src/lib/db";

type Row = {
  id: string;
  status: string;
  playerCount: number | null;
  createdAt: Date;
  seasonId: string;
  date: Date;
  matches: number;
  participants: number;
  jokers: number;
};

async function findDuplicateGroups(): Promise<Row[][]> {
  const groups = await prisma.$queryRaw<
    { seasonId: string; date: Date; count: bigint }[]
  >`
    SELECT "seasonId", date, COUNT(*) AS count
    FROM "GameDay"
    GROUP BY "seasonId", date
    HAVING COUNT(*) > 1
    ORDER BY date ASC
  `;

  const result: Row[][] = [];
  for (const g of groups) {
    const rows = await prisma.gameDay.findMany({
      where: { seasonId: g.seasonId, date: g.date },
      orderBy: { createdAt: "asc" },
    });
    const expanded: Row[] = [];
    for (const r of rows) {
      const [matches, participants, jokers] = await Promise.all([
        prisma.match.count({ where: { gameDayId: r.id } }),
        prisma.gameDayParticipant.count({ where: { gameDayId: r.id } }),
        prisma.jokerUse.count({ where: { gameDayId: r.id } }),
      ]);
      expanded.push({
        id: r.id,
        status: r.status,
        playerCount: r.playerCount,
        createdAt: r.createdAt,
        seasonId: r.seasonId,
        date: r.date,
        matches,
        participants,
        jokers,
      });
    }
    result.push(expanded);
  }
  return result;
}

// Higher score = keep. Prefer more matches, then participants, then jokers, then older row.
function score(r: Row): number {
  return (
    r.matches * 1_000_000 +
    r.participants * 10_000 +
    r.jokers * 100 -
    r.createdAt.getTime() / 1e9
  );
}

function fmt(r: Row): string {
  return (
    `  ${r.id}  status=${r.status.padEnd(14)}  ` +
    `matches=${String(r.matches).padStart(2)}  ` +
    `participants=${String(r.participants).padStart(2)}  ` +
    `jokers=${String(r.jokers).padStart(2)}  ` +
    `createdAt=${r.createdAt.toISOString()}`
  );
}

async function main() {
  const commit = process.argv.includes("--commit");
  console.log(commit ? "MODE: COMMIT (will delete)" : "MODE: dry-run (add --commit to delete)");
  console.log();

  const groups = await findDuplicateGroups();
  if (groups.length === 0) {
    console.log("No duplicate (seasonId, date) tuples found.");
    return;
  }

  for (const group of groups) {
    const head = group[0];
    console.log(
      `Duplicate group seasonId=${head.seasonId} date=${head.date.toISOString().slice(0, 10)}:`,
    );
    for (const r of group) console.log(fmt(r));

    const sorted = [...group].sort((a, b) => score(b) - score(a));
    const keep = sorted[0];
    const drop = sorted.slice(1);
    console.log(`  → KEEP  ${keep.id}`);
    for (const d of drop) console.log(`  → DROP  ${d.id}`);

    if (commit) {
      for (const d of drop) {
        if (d.jokers > 0) {
          const deleted = await prisma.jokerUse.deleteMany({ where: { gameDayId: d.id } });
          console.log(`    deleted ${deleted.count} JokerUse row(s) for ${d.id}`);
        }
        await prisma.gameDay.delete({ where: { id: d.id } });
        console.log(`    deleted GameDay ${d.id} (matches + participants cascaded)`);
      }
    }
    console.log();
  }

  if (!commit) {
    console.log("Re-run with --commit to apply the deletions shown above.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
