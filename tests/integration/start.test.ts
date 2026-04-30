import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { startGameDay } from "@/lib/game-day/start";
import { resetDb } from "../helpers/reset-db";

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

describe("startGameDay", () => {
  beforeEach(resetDb);

  it("generates 15 matches for 5 confirmed players and flips status to in_progress", async () => {
    const players = await seedSixPlayers();
    const day = await createGameDay(new Date("2026-04-21"), players[0].id);
    for (let i = 0; i < 5; i++) {
      await setAttendance(day.id, players[i].id, "confirmed");
    }

    await startGameDay(day.id, players[0].id);

    const updated = await prisma.gameDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(updated.status).toBe("in_progress");
    expect(updated.playerCount).toBe(5);
    expect(updated.seed).toBeTruthy();

    const matches = await prisma.match.findMany({ where: { gameDayId: day.id } });
    expect(matches).toHaveLength(15);
  });

  it("rejects starting with fewer than 4 confirmed players", async () => {
    const players = await seedSixPlayers();
    const day = await createGameDay(new Date("2026-04-21"), players[0].id);
    await setAttendance(day.id, players[0].id, "confirmed");

    await expect(startGameDay(day.id, players[0].id)).rejects.toThrow(/at least 4/i);
  });

  it("rejects starting with more than 6 confirmed players", async () => {
    const players = await seedSixPlayers();
    await prisma.player.create({ data: { name: "P7", email: "p7@x", passwordHash: "x" } });
    const day = await createGameDay(new Date("2026-04-21"), players[0].id);
    const allPlayers = await prisma.player.findMany();
    for (const p of allPlayers) await setAttendance(day.id, p.id, "confirmed");

    await expect(startGameDay(day.id, players[0].id)).rejects.toThrow(/at most 6/i);
  });

  it("rejects starting an already-started game day", async () => {
    const players = await seedSixPlayers();
    const day = await createGameDay(new Date("2026-04-21"), players[0].id);
    for (let i = 0; i < 5; i++) {
      await setAttendance(day.id, players[i].id, "confirmed");
    }
    await startGameDay(day.id, players[0].id);

    await expect(startGameDay(day.id, players[0].id)).rejects.toThrow(/already started/i);
  });

  // Preview-shuffle invariant: if the admin pressed "Reihenfolge
  // mischen" while the day was planned, gameDay.seed gets a value;
  // startGameDay must reuse that seed so the order the players saw
  // in the preview is exactly what shows up after start.
  it("reuses an already-set seed (set by shuffle-preview) instead of regenerating", async () => {
    const players = await seedSixPlayers();
    const day = await createGameDay(new Date("2026-04-21"), players[0].id);
    for (let i = 0; i < 5; i++) {
      await setAttendance(day.id, players[i].id, "confirmed");
    }
    const presetSeed = "preset-from-preview-shuffle";
    await prisma.gameDay.update({
      where: { id: day.id },
      data: { seed: presetSeed },
    });

    await startGameDay(day.id, players[0].id);

    const after = await prisma.gameDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(after.seed).toBe(presetSeed);
  });
});
