// Seed demo players and (optionally) confirm them on the open game day.
// Idempotent — safe to re-run.
//
// Usage:
//   pnpm seed:demo                 # just create the 5 dummy players
//   pnpm seed:demo --confirm-all   # also attach them to the open planned
//                                  # game day and mark them as confirmed
//
// The 5 confirmed demo players satisfy lockRoster's 4–6 requirement, so
// you can click "Spieltag starten" in the Admin UI right after.

import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/hash";

const DEMO_PASSWORD = "demo12345";
const DUMMIES = [
  { name: "Anna",   email: "anna@demo.local" },
  { name: "Ben",    email: "ben@demo.local" },
  { name: "Clara",  email: "clara@demo.local" },
  { name: "Daniel", email: "daniel@demo.local" },
  { name: "Eva",    email: "eva@demo.local" },
];

async function main() {
  const confirmAll = process.argv.includes("--confirm-all");
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const d of DUMMIES) {
    await prisma.player.upsert({
      where: { email: d.email },
      update: {},
      create: { name: d.name, email: d.email, passwordHash, isAdmin: false },
    });
  }
  console.log(`Ensured ${DUMMIES.length} dummy players (password: ${DEMO_PASSWORD}).`);

  if (!confirmAll) {
    console.log("Tip: re-run with --confirm-all to mark them confirmed on the open game day.");
    return;
  }

  const day = await prisma.gameDay.findFirst({
    where: { status: "planned" },
    orderBy: { date: "desc" },
  });
  if (!day) {
    console.error("No planned game day found. Create one in the Admin UI first.");
    process.exit(1);
  }

  const dummies = await prisma.player.findMany({
    where: { email: { in: DUMMIES.map((d) => d.email) } },
    select: { id: true, name: true },
  });

  await prisma.$transaction(async (tx) => {
    for (const p of dummies) {
      await tx.gameDayParticipant.upsert({
        where: { gameDayId_playerId: { gameDayId: day.id, playerId: p.id } },
        update: { attendance: "confirmed", respondedAt: new Date() },
        create: {
          gameDayId: day.id,
          playerId: p.id,
          attendance: "confirmed",
          respondedAt: new Date(),
        },
      });
    }
  });

  const date = day.date.toISOString().slice(0, 10);
  console.log(`Confirmed ${dummies.length} demo players on game day ${date}.`);
  console.log(`Click "Spieltag starten" in the Admin UI to lock the roster.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
