// Reset game-day state so the e2e test starts from a clean slate.
// Deletes ANY non-finished game-days (planned, roster_locked, in_progress).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  const days = await prisma.gameDay.findMany({
    where: { status: { in: ["planned", "roster_locked", "in_progress"] } },
    select: { id: true, date: true, status: true },
  });
  console.log("Non-finished game-days:", days);
  for (const d of days) {
    // Cascading deletes: matches, participants, jokerUses, etc., depending on schema.
    // Try to delete; on FK error, manually clean dependents first.
    try {
      await prisma.gameDay.delete({ where: { id: d.id } });
      console.log(`Deleted ${d.id} (${d.status} ${d.date.toISOString()})`);
    } catch (err) {
      console.log(`Direct delete failed for ${d.id}: ${err.message}; cascading manually`);
      await prisma.match.deleteMany({ where: { gameDayId: d.id } });
      await prisma.gameDayParticipant.deleteMany({ where: { gameDayId: d.id } });
      // jokerUse FKs?
      try {
        await prisma.jokerUse.deleteMany({ where: { gameDayId: d.id } });
      } catch {
        // ignore if model name differs
      }
      await prisma.gameDay.delete({ where: { id: d.id } });
      console.log(`Deleted ${d.id} after manual cascade`);
    }
  }
  console.log("Reset complete.");
} finally {
  await prisma.$disconnect();
}
