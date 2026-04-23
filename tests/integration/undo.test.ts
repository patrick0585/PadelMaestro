import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { lockRoster } from "@/lib/game-day/lock";
import { enterScore } from "@/lib/match/enter-score";
import { undoScore } from "@/lib/match/undo";
import { resetDb } from "../helpers/reset-db";

async function setupAndEnter() {
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
  await enterScore({
    matchId: matches[0].id,
    team1Score: 2,
    team2Score: 1,
    scoredBy: players[0].id,
    expectedVersion: 0,
    isAdmin: true,
  });
  return { players, day, matchId: matches[0].id };
}

describe("undoScore", () => {
  beforeEach(resetDb);

  it("clears the score when called by the same scorer within 2 minutes", async () => {
    const { players, matchId } = await setupAndEnter();
    await undoScore({ matchId, actorId: players[0].id });
    const m = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(m.team1Score).toBeNull();
    expect(m.team2Score).toBeNull();
  });

  it("rejects undo after 2-minute window", async () => {
    const { players, matchId } = await setupAndEnter();
    await prisma.match.update({
      where: { id: matchId },
      data: { scoredAt: new Date(Date.now() - 3 * 60 * 1000) },
    });
    await expect(undoScore({ matchId, actorId: players[0].id })).rejects.toThrow(/window/i);
  });

  it("rejects undo by a different non-admin user", async () => {
    const { players, matchId } = await setupAndEnter();
    await expect(undoScore({ matchId, actorId: players[1].id })).rejects.toThrow(/permission/i);
  });
});
