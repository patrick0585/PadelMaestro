import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { lockRoster } from "@/lib/game-day/lock";

async function resetDb() {
  await prisma.auditLog.deleteMany();
  await prisma.match.deleteMany();
  await prisma.gameDayParticipant.deleteMany();
  await prisma.gameDay.deleteMany();
  await prisma.season.deleteMany();
  await prisma.player.deleteMany();
}

async function seedSixPlayers() {
  const players = [];
  for (let i = 1; i <= 6; i++) {
    const p = await prisma.player.create({
      data: {
        name: `P${i}`,
        email: `p${i}@x`,
        passwordHash: "x",
        isAdmin: i === 1,
      },
    });
    players.push(p);
  }
  return players;
}

describe("lockRoster", () => {
  beforeEach(resetDb);

  it("generates 15 matches for 5 confirmed players and locks the game day", async () => {
    const players = await seedSixPlayers();
    const day = await createGameDay(new Date("2026-04-21"), players[0].id);
    for (let i = 0; i < 5; i++) {
      await setAttendance(day.id, players[i].id, "confirmed");
    }

    await lockRoster(day.id, players[0].id);

    const updated = await prisma.gameDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(updated.status).toBe("roster_locked");
    expect(updated.playerCount).toBe(5);
    expect(updated.seed).toBeTruthy();

    const matches = await prisma.match.findMany({ where: { gameDayId: day.id } });
    expect(matches).toHaveLength(15);
  });

  it("rejects locking with fewer than 4 confirmed players", async () => {
    const players = await seedSixPlayers();
    const day = await createGameDay(new Date("2026-04-21"), players[0].id);
    await setAttendance(day.id, players[0].id, "confirmed");

    await expect(lockRoster(day.id, players[0].id)).rejects.toThrow(/at least 4/i);
  });

  it("rejects locking with more than 6 confirmed players", async () => {
    const players = await seedSixPlayers();
    await prisma.player.create({ data: { name: "P7", email: "p7@x", passwordHash: "x" } });
    const day = await createGameDay(new Date("2026-04-21"), players[0].id);
    const allPlayers = await prisma.player.findMany();
    for (const p of allPlayers) await setAttendance(day.id, p.id, "confirmed");

    await expect(lockRoster(day.id, players[0].id)).rejects.toThrow(/at most 6/i);
  });
});
