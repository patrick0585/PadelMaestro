// Hard cleanup of e2e-test-created game-days. Pass a cutoff date as the
// first arg; only days with date >= cutoff are deleted (incl. matches,
// participants, joker uses).
//
//   node tests/e2e/clean-recent.mjs 2026-04-30
//
// No arg → defaults to today (UTC midnight).
import { PrismaClient } from "@prisma/client";

// Safety: refuse to run against anything that doesn't look like a local
// dev database. Override with E2E_ALLOW_NONLOCAL=1 if you really mean it.
const dbUrl = process.env.DATABASE_URL ?? "";
const looksLocal = /@(localhost|127\.0\.0\.1|0\.0\.0\.0)[:/]/.test(dbUrl);
if (!looksLocal && process.env.E2E_ALLOW_NONLOCAL !== "1") {
  console.error("Refusing to run: DATABASE_URL does not target a local host.");
  process.exit(2);
}

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
