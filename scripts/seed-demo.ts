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
// With more than one group, add --group <slug>.

import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/hash";
import { pathToFileURL } from "node:url";
import { resolveGroup } from "../src/lib/group/resolve-group";

const DEMO_PASSWORD = "demo12345";
const DUMMIES = [
  { name: "Anna",   email: "anna@demo.local" },
  { name: "Ben",    email: "ben@demo.local" },
  { name: "Clara",  email: "clara@demo.local" },
  { name: "Daniel", email: "daniel@demo.local" },
  { name: "Eva",    email: "eva@demo.local" },
];

export async function seedDemo(groupId: string, opts: { confirmAll: boolean }): Promise<void> {
  const { confirmAll } = opts;
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const d of DUMMIES) {
    const player = await prisma.player.upsert({
      where: { email: d.email },
      update: { emailVerifiedAt: new Date() },
      create: { name: d.name, email: d.email, passwordHash, emailVerifiedAt: new Date() },
    });
    await prisma.membership.upsert({
      where: { groupId_playerId: { groupId, playerId: player.id } },
      update: {},
      create: { groupId, playerId: player.id, role: "member" },
    });
  }
  console.log(`Ensured ${DUMMIES.length} dummy players (password: ${DEMO_PASSWORD}).`);

  if (!confirmAll) {
    console.log("Tip: re-run with --confirm-all to mark them confirmed on the open game day.");
    return;
  }

  const day = await prisma.gameDay.findFirst({
    where: { status: "planned", groupId },
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

async function main() {
  const argv = process.argv.slice(2);
  const group = await resolveGroup(argv);
  await seedDemo(group.id, { confirmAll: argv.includes("--confirm-all") });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
