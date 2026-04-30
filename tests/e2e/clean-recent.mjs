// Hard cleanup of e2e-test-created game-days. Pass a cutoff date as the
// first arg; only days with date >= cutoff are deleted (incl. matches,
// participants, joker uses).
//
//   node tests/e2e/clean-recent.mjs 2026-04-30
//
// No arg → defaults to today (UTC midnight).
import { PrismaClient } from "@prisma/client";

const arg = process.argv[2];
const cutoff = arg
  ? new Date(`${arg}T00:00:00.000Z`)
  : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
if (Number.isNaN(cutoff.getTime())) {
  console.error(`invalid cutoff date: ${arg}`);
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const days = await prisma.gameDay.findMany({
    where: { date: { gte: cutoff } },
    select: { id: true, date: true, status: true },
  });
  console.log("Deleting:", days);
  for (const d of days) {
    await prisma.match.deleteMany({ where: { gameDayId: d.id } });
    await prisma.gameDayParticipant.deleteMany({ where: { gameDayId: d.id } });
    try {
      await prisma.jokerUse.deleteMany({ where: { gameDayId: d.id } });
    } catch {}
    await prisma.gameDay.delete({ where: { id: d.id } });
    console.log(`Deleted ${d.id}`);
  }
} finally {
  await prisma.$disconnect();
}
