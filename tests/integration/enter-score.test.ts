import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { lockRoster } from "@/lib/game-day/lock";
import { enterScore, ScoreConflictError } from "@/lib/match/enter-score";

async function resetDb() {
  await prisma.auditLog.deleteMany();
  await prisma.match.deleteMany();
  await prisma.gameDayParticipant.deleteMany();
  await prisma.gameDay.deleteMany();
  await prisma.season.deleteMany();
  await prisma.player.deleteMany();
}

async function setupFivePlayerGame() {
  const players = [];
  for (let i = 1; i <= 5; i++) {
    players.push(
      await prisma.player.create({
        data: { name: `P${i}`, email: `p${i}@x`, passwordHash: "x", isAdmin: i === 1 },
      }),
    );
  }
  const day = await createGameDay(new Date("2026-04-21"), players[0].id);
  for (const p of players) await setAttendance(day.id, p.id, "confirmed");
  await lockRoster(day.id, players[0].id);
  const matches = await prisma.match.findMany({
    where: { gameDayId: day.id },
    orderBy: { matchNumber: "asc" },
  });
  return { players, day, matches };
}

describe("enterScore", () => {
  beforeEach(resetDb);

  it("saves a valid score and increments version", async () => {
    const { players, matches } = await setupFivePlayerGame();
    const match = matches[0];

    const updated = await enterScore({
      matchId: match.id,
      team1Score: 3,
      team2Score: 1,
      scoredBy: players[0].id,
      expectedVersion: 0,
    });
    expect(updated.team1Score).toBe(3);
    expect(updated.team2Score).toBe(1);
    expect(updated.version).toBe(1);
  });

  it("rejects invalid scores with clear error", async () => {
    const { players, matches } = await setupFivePlayerGame();
    await expect(
      enterScore({
        matchId: matches[0].id,
        team1Score: 4,
        team2Score: 0,
        scoredBy: players[0].id,
        expectedVersion: 0,
      }),
    ).rejects.toThrow(/winning score/i);
  });

  it("rejects a concurrent write with stale version", async () => {
    const { players, matches } = await setupFivePlayerGame();
    await enterScore({
      matchId: matches[0].id,
      team1Score: 3,
      team2Score: 0,
      scoredBy: players[0].id,
      expectedVersion: 0,
    });
    await expect(
      enterScore({
        matchId: matches[0].id,
        team1Score: 0,
        team2Score: 3,
        scoredBy: players[1].id,
        expectedVersion: 0,
      }),
    ).rejects.toThrow(ScoreConflictError);
  });
});
