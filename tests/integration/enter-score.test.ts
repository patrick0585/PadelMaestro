import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { startGameDay } from "@/lib/game-day/start";
import {
  enterScore,
  ScoreConflictError,
  GameDayFinishedError,
  GameDayNotStartedError,
  NotAllowedError,
} from "@/lib/match/enter-score";
import {
  subscribeToGameDay,
  __resetLiveBroadcastForTests,
} from "@/lib/game-day/live-broadcast";
import { resetDb } from "../helpers/reset-db";

async function setupFivePlayerGame() {
  return setupGame(5);
}

async function setupGame(count: number) {
  const players = [];
  for (let i = 1; i <= count; i++) {
    players.push(
      await prisma.player.create({
        data: { name: `P${i}`, email: `p${i}@x`, passwordHash: "x", isAdmin: i === 1 },
      }),
    );
  }
  const day = await createGameDay(new Date("2026-04-21"), players[0].id);
  for (const p of players) await setAttendance(day.id, p.id, "confirmed");
  await startGameDay(day.id, players[0].id);
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
      team1Score: 2,
      team2Score: 1,
      scoredBy: players[0].id,
      expectedVersion: 0,
      isAdmin: true,
    });
    expect(updated.team1Score).toBe(2);
    expect(updated.team2Score).toBe(1);
    expect(updated.version).toBe(1);
  });

  it("accepts a 7:6 tennis-set score on a 4-player day (no minimum-lead requirement)", async () => {
    const { players, matches } = await setupGame(4);
    const updated = await enterScore({
      matchId: matches[0].id,
      team1Score: 7,
      team2Score: 6,
      scoredBy: players[0].id,
      expectedVersion: 0,
      isAdmin: true,
    });
    expect(updated.team1Score).toBe(7);
    expect(updated.team2Score).toBe(6);
  });

  it("accepts a 6:5 tennis-set score on a 4-player day (no minimum-lead requirement)", async () => {
    const { players, matches } = await setupGame(4);
    const updated = await enterScore({
      matchId: matches[0].id,
      team1Score: 6,
      team2Score: 5,
      scoredBy: players[0].id,
      expectedVersion: 0,
      isAdmin: true,
    });
    expect(updated.team1Score).toBe(6);
    expect(updated.team2Score).toBe(5);
  });

  it("rejects invalid scores with clear error", async () => {
    const { players, matches } = await setupFivePlayerGame();
    await expect(
      enterScore({
        matchId: matches[0].id,
        team1Score: 3,
        team2Score: 1,
        scoredBy: players[0].id,
        expectedVersion: 0,
        isAdmin: true,
      }),
    ).rejects.toThrow(/sum to 3/i);
  });

  it("rejects a concurrent write with stale version", async () => {
    const { players, matches } = await setupFivePlayerGame();
    await enterScore({
      matchId: matches[0].id,
      team1Score: 3,
      team2Score: 0,
      scoredBy: players[0].id,
      expectedVersion: 0,
      isAdmin: true,
    });
    await expect(
      enterScore({
        matchId: matches[0].id,
        team1Score: 0,
        team2Score: 3,
        scoredBy: players[1].id,
        expectedVersion: 0,
        isAdmin: true,
      }),
    ).rejects.toThrow(ScoreConflictError);
  });

  it("rejects enterScore on a game day that has not been started yet", async () => {
    // Build the in_progress setup, then flip the status BACK to planned
    // so the matches still exist but the game day is no longer "live".
    const { players, day, matches } = await setupFivePlayerGame();
    await prisma.gameDay.update({ where: { id: day.id }, data: { status: "planned" } });

    await expect(
      enterScore({
        matchId: matches[0].id,
        team1Score: 3,
        team2Score: 0,
        scoredBy: players[0].id,
        expectedVersion: 0,
        isAdmin: true,
      }),
    ).rejects.toBeInstanceOf(GameDayNotStartedError);
  });

  it("publishes a live update on every score (subscriber receives it)", async () => {
    __resetLiveBroadcastForTests();
    const { players, day, matches } = await setupFivePlayerGame();

    let calls = 0;
    const off = subscribeToGameDay(day.id, () => {
      calls++;
    });

    await enterScore({
      matchId: matches[0].id,
      team1Score: 3,
      team2Score: 0,
      scoredBy: players[0].id,
      expectedVersion: 0,
      isAdmin: true,
    });

    expect(calls).toBe(1);
    off();
  });

  it("keeps status in_progress while matches remain unscored", async () => {
    const { players, day, matches } = await setupFivePlayerGame();
    await enterScore({
      matchId: matches[0].id,
      team1Score: 3,
      team2Score: 0,
      scoredBy: players[0].id,
      expectedVersion: 0,
      isAdmin: true,
    });
    await enterScore({
      matchId: matches[1].id,
      team1Score: 2,
      team2Score: 1,
      scoredBy: players[0].id,
      expectedVersion: 0,
      isAdmin: true,
    });

    const after = await prisma.gameDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(after.status).toBe("in_progress");
  });

  it("keeps status in_progress when the last match is scored (no auto-finish)", async () => {
    const { players, day, matches } = await setupFivePlayerGame();
    for (const m of matches) {
      await enterScore({
        matchId: m.id,
        team1Score: 3,
        team2Score: 0,
        scoredBy: players[0].id,
        expectedVersion: 0,
        isAdmin: true,
      });
    }

    const after = await prisma.gameDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(after.status).toBe("in_progress");
  });

  it("rejects score edits after the day is manually finished", async () => {
    const { players, day, matches } = await setupFivePlayerGame();
    for (const m of matches) {
      await enterScore({
        matchId: m.id,
        team1Score: 3,
        team2Score: 0,
        scoredBy: players[0].id,
        expectedVersion: 0,
        isAdmin: true,
      });
    }
    await prisma.gameDay.update({ where: { id: day.id }, data: { status: "finished" } });

    await expect(
      enterScore({
        matchId: matches[0].id,
        team1Score: 2,
        team2Score: 1,
        scoredBy: players[0].id,
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(GameDayFinishedError);
  });

  it("allows a match participant to enter the score", async () => {
    const { matches } = await setupFivePlayerGame();
    const match = matches[0];

    const updated = await enterScore({
      matchId: match.id,
      team1Score: 2,
      team2Score: 1,
      scoredBy: match.team1PlayerAId,
      expectedVersion: 0,
    });
    expect(updated.version).toBe(1);
  });

  it("allows a confirmed day participant who is not playing this match", async () => {
    const { players, matches } = await setupFivePlayerGame();
    // The seeded shuffle decides who sits out match 1; pick the first
    // match whose bench player is not the admin so the test is stable.
    const onCourtOf = (m: (typeof matches)[number]) =>
      new Set([m.team1PlayerAId, m.team1PlayerBId, m.team2PlayerAId, m.team2PlayerBId]);
    const found = matches
      .map((m) => ({ m, bench: players.find((p) => !onCourtOf(m).has(p.id) && !p.isAdmin) }))
      .find((x) => x.bench);
    if (!found?.bench) throw new Error("no bench player available");
    const { m: match, bench } = found;

    const updated = await enterScore({
      matchId: match.id,
      team1Score: 2,
      team2Score: 1,
      scoredBy: bench.id,
      expectedVersion: 0,
    });
    expect(updated.version).toBe(1);
    expect(updated.scoredById).toBe(bench.id);
  });

  it("rejects a day participant whose attendance is declined", async () => {
    const { players, day, matches } = await setupFivePlayerGame();
    const nonAdmin = players.find((p) => !p.isAdmin)!;
    await prisma.gameDayParticipant.update({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: nonAdmin.id } },
      data: { attendance: "declined" },
    });

    await expect(
      enterScore({
        matchId: matches[0].id,
        team1Score: 2,
        team2Score: 1,
        scoredBy: nonAdmin.id,
        expectedVersion: 0,
      }),
    ).rejects.toBeInstanceOf(NotAllowedError);
  });

  it("rejects a non-participant non-admin with NotAllowedError", async () => {
    const { matches } = await setupFivePlayerGame();
    const match = matches[0];
    const outsider = await prisma.player.create({
      data: { name: "outsider", email: "o@x", passwordHash: "x" },
    });

    await expect(
      enterScore({
        matchId: match.id,
        team1Score: 2,
        team2Score: 1,
        scoredBy: outsider.id,
        expectedVersion: 0,
      }),
    ).rejects.toBeInstanceOf(NotAllowedError);
  });

  it("allows an admin who is not a match participant to enter the score", async () => {
    const { matches } = await setupFivePlayerGame();
    const match = matches[0];
    const adminOutside = await prisma.player.create({
      data: { name: "admin2", email: "a2@x", passwordHash: "x", isAdmin: true },
    });

    const updated = await enterScore({
      matchId: match.id,
      team1Score: 2,
      team2Score: 1,
      scoredBy: adminOutside.id,
      expectedVersion: 0,
      isAdmin: true,
    });
    expect(updated.version).toBe(1);
  });

  it("still blocks admin score entry after day is finished", async () => {
    const { players, day, matches } = await setupFivePlayerGame();
    await prisma.gameDay.update({ where: { id: day.id }, data: { status: "finished" } });

    await expect(
      enterScore({
        matchId: matches[0].id,
        team1Score: 2,
        team2Score: 1,
        scoredBy: players[0].id,
        expectedVersion: 0,
        isAdmin: true,
      }),
    ).rejects.toBeInstanceOf(GameDayFinishedError);
  });
});
