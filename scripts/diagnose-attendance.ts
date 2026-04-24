import { prisma } from "../src/lib/db";

async function main() {
  const identifier = process.argv[2];
  if (!identifier) {
    console.error("Usage: pnpm tsx scripts/diagnose-attendance.ts <email-or-name-or-username>");
    console.error("Set DATABASE_URL to the prod DB when diagnosing production issues.");
    process.exit(1);
  }

  const player = await prisma.player.findFirst({
    where: {
      OR: [
        { email: identifier },
        { username: identifier.toLowerCase() },
        { name: { equals: identifier, mode: "insensitive" } },
      ],
    },
  });

  if (!player) {
    console.error(`No player found matching "${identifier}".`);
    process.exit(1);
  }

  console.log("=== Player ===");
  console.log(`id:        ${player.id}`);
  console.log(`name:      ${player.name}`);
  console.log(`email:     ${player.email ?? "(none)"}`);
  console.log(`username:  ${player.username ?? "(none)"}`);
  console.log(`isAdmin:   ${player.isAdmin}`);
  console.log(`deletedAt: ${player.deletedAt?.toISOString() ?? "(active)"}`);
  console.log(`createdAt: ${player.createdAt.toISOString()}`);

  const activeSeason = await prisma.season.findFirst({ where: { isActive: true } });
  if (!activeSeason) {
    console.log("\n(!) No active season found.");
    return;
  }
  console.log(`\n=== Active season: ${activeSeason.year} (${activeSeason.id}) ===`);

  const plannedDay = await prisma.gameDay.findFirst({
    where: { seasonId: activeSeason.id, status: "planned" },
    orderBy: { date: "asc" },
  });

  if (!plannedDay) {
    console.log("(!) No planned game day in the active season. Dashboard would show no hero.");
  } else {
    console.log("\n=== Next planned game day ===");
    console.log(`id:     ${plannedDay.id}`);
    console.log(`date:   ${plannedDay.date.toISOString().slice(0, 10)}`);
    console.log(`status: ${plannedDay.status}`);

    const me = await prisma.gameDayParticipant.findUnique({
      where: { gameDayId_playerId: { gameDayId: plannedDay.id, playerId: player.id } },
    });
    if (!me) {
      console.log(
        `\n(!) ${player.name} is NOT a GameDayParticipant for this day.`,
      );
      console.log(
        "    → API would return 403 ATTENDANCE_NOT_PARTICIPANT on confirm.",
      );
      console.log(
        "    → UI shows: \"Du bist nicht Teilnehmer dieses Spieltags. Bitte den Admin, dich aufzunehmen.\"",
      );
    } else {
      console.log("\n=== Participant row for this day ===");
      console.log(`attendance:  ${me.attendance}`);
      console.log(`respondedAt: ${me.respondedAt?.toISOString() ?? "(never)"}`);
      console.log(`createdAt:   ${me.createdAt.toISOString()}`);
      console.log(
        "    → DB state looks fine; if confirm fails now, it is almost certainly 401 (session expired) or 500.",
      );
    }
  }

  console.log("\n=== Last 5 planned days in this season ===");
  const lastPlanned = await prisma.gameDay.findMany({
    where: { seasonId: activeSeason.id },
    orderBy: { date: "desc" },
    take: 5,
    include: {
      participants: {
        where: { playerId: player.id },
        select: { attendance: true, respondedAt: true },
      },
    },
  });
  for (const d of lastPlanned) {
    const p = d.participants[0];
    const mark = p ? `${p.attendance}@${p.respondedAt?.toISOString().slice(0, 16) ?? "-"}` : "NOT A PARTICIPANT";
    console.log(`${d.date.toISOString().slice(0, 10)}  ${d.status.padEnd(14)} ${mark}`);
  }

  console.log("\n=== Recent audit log entries for this player ===");
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { actorId: player.id },
        { payload: { path: ["playerId"], equals: player.id } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { createdAt: true, action: true, actorId: true, entityType: true },
  });
  for (const l of logs) {
    const self = l.actorId === player.id ? "self" : "other";
    console.log(
      `${l.createdAt.toISOString().slice(0, 16)}  ${l.action.padEnd(36)} actor=${self} entity=${l.entityType}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
