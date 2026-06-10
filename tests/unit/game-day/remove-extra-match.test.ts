import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { startGameDay } from "@/lib/game-day/start";
import { addExtraMatch } from "@/lib/game-day/add-extra-match";
import { GameDayNotActiveError } from "@/lib/game-day/add-extra-match";
import {
  removeExtraMatch,
  MatchNotFoundError,
  NotAnExtraMatchError,
} from "@/lib/game-day/remove-extra-match";
import {
  subscribeToGameDay,
  __resetLiveBroadcastForTests,
} from "@/lib/game-day/live-broadcast";
import { resetDb } from "../../helpers/reset-db";

// Monotonic counter so emails stay unique even when a single test builds
// two game days (e.g. the cross-game-day case).
let playerSeq = 0;

// `count` confirmed players. 4 players → template generates 3 matches,
// 5/6 players → 15 matches. So the first extra match is matchNumber
// (template total + 1).
async function setupDay(count: number, date = new Date("2026-06-09")) {
  const players = [];
  for (let i = 1; i <= count; i++) {
    const n = playerSeq++;
    players.push(
      await prisma.player.create({
        data: { name: `P${n}`, email: `p${n}@example.com`, passwordHash: "x", isAdmin: i === 1 },
      }),
    );
  }
  const day = await createGameDay(date, players[0].id);
  for (const p of players) await setAttendance(day.id, p.id, "confirmed");
  await startGameDay(day.id, players[0].id);
  return { players, day };
}
const setupFive = () => setupDay(5);

describe("removeExtraMatch", () => {
  beforeEach(resetDb);

  it("removes an unscored extra match and writes an audit log", async () => {
    const { players, day } = await setupFive();
    const extra = await addExtraMatch(day.id, players[0].id);

    const result = await removeExtraMatch(day.id, extra.id, players[0].id);
    expect(result.gameDayId).toBe(day.id);

    expect(await prisma.match.findUnique({ where: { id: extra.id } })).toBeNull();
    expect(await prisma.match.count({ where: { gameDayId: day.id } })).toBe(15);

    const entries = await prisma.auditLog.findMany({
      where: { action: "game_day.remove_extra_match", entityId: extra.id },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].payload).toMatchObject({
      gameDayId: day.id,
      matchNumber: 16,
      hadScore: false,
    });
  });

  it("removes a scored extra match and records the score in the audit log", async () => {
    const { players, day } = await setupFive();
    const extra = await addExtraMatch(day.id, players[0].id);
    await prisma.match.update({
      where: { id: extra.id },
      data: { team1Score: 3, team2Score: 0 },
    });

    await removeExtraMatch(day.id, extra.id, players[0].id);

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { action: "game_day.remove_extra_match", entityId: extra.id },
    });
    expect(entry.payload).toMatchObject({
      hadScore: true,
      team1Score: 3,
      team2Score: 0,
    });
  });

  it("renumbers trailing extra matches so no gap remains", async () => {
    const { players, day } = await setupFive();
    const m16 = await addExtraMatch(day.id, players[0].id); // #16
    const m17 = await addExtraMatch(day.id, players[0].id); // #17
    expect(m16.matchNumber).toBe(16);
    expect(m17.matchNumber).toBe(17);

    await removeExtraMatch(day.id, m16.id, players[0].id);

    // #17 slides down into #16; the row identity is preserved.
    const slid = await prisma.match.findUniqueOrThrow({ where: { id: m17.id } });
    expect(slid.matchNumber).toBe(16);

    const numbers = (
      await prisma.match.findMany({
        where: { gameDayId: day.id },
        orderBy: { matchNumber: "asc" },
        select: { matchNumber: true },
      })
    ).map((m) => m.matchNumber);
    // Contiguous 1..16, no gap, no duplicate.
    expect(numbers).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it("renumbers only the matches after a removed MIDDLE extra (3 extras)", async () => {
    const { players, day } = await setupFive();
    const m16 = await addExtraMatch(day.id, players[0].id); // #16
    const m17 = await addExtraMatch(day.id, players[0].id); // #17 — removed
    const m18 = await addExtraMatch(day.id, players[0].id); // #18

    await removeExtraMatch(day.id, m17.id, players[0].id);

    // #16 untouched, #18 slides into #17 — only trailing rows move.
    expect((await prisma.match.findUniqueOrThrow({ where: { id: m16.id } })).matchNumber).toBe(16);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: m18.id } })).matchNumber).toBe(17);

    const numbers = (
      await prisma.match.findMany({
        where: { gameDayId: day.id },
        orderBy: { matchNumber: "asc" },
        select: { matchNumber: true },
      })
    ).map((m) => m.matchNumber);
    expect(numbers).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
  });

  it("rejects a template match with NotAnExtraMatchError", async () => {
    const { players, day } = await setupFive();
    const template = await prisma.match.findFirstOrThrow({
      where: { gameDayId: day.id, matchNumber: 1 },
    });
    await expect(removeExtraMatch(day.id, template.id, players[0].id)).rejects.toBeInstanceOf(
      NotAnExtraMatchError,
    );
    // Nothing was deleted.
    expect(await prisma.match.count({ where: { gameDayId: day.id } })).toBe(15);
  });

  it("honours the 4-player template boundary: #3 is fixed, #4 is removable", async () => {
    const { players, day } = await setupDay(4); // template totalMatches = 3
    const m3 = await prisma.match.findFirstOrThrow({
      where: { gameDayId: day.id, matchNumber: 3 },
    });
    await expect(removeExtraMatch(day.id, m3.id, players[0].id)).rejects.toBeInstanceOf(
      NotAnExtraMatchError,
    );

    const extra = await addExtraMatch(day.id, players[0].id); // #4
    expect(extra.matchNumber).toBe(4);
    await removeExtraMatch(day.id, extra.id, players[0].id);
    expect(await prisma.match.findUnique({ where: { id: extra.id } })).toBeNull();
  });

  it("rejects when the game day is finished", async () => {
    const { players, day } = await setupFive();
    const extra = await addExtraMatch(day.id, players[0].id);
    await prisma.gameDay.update({ where: { id: day.id }, data: { status: "finished" } });
    await expect(removeExtraMatch(day.id, extra.id, players[0].id)).rejects.toBeInstanceOf(
      GameDayNotActiveError,
    );
  });

  it("throws MatchNotFoundError for an unknown match id", async () => {
    const { players, day } = await setupFive();
    await expect(
      removeExtraMatch(day.id, "00000000-0000-0000-0000-000000000000", players[0].id),
    ).rejects.toBeInstanceOf(MatchNotFoundError);
  });

  it("throws MatchNotFoundError when the match belongs to a different game day", async () => {
    const a = await setupDay(5, new Date("2026-06-09"));
    const b = await setupDay(5, new Date("2026-06-16"));
    const extraB = await addExtraMatch(b.day.id, b.players[0].id);
    // Right match id, wrong game-day id in the path → not found, not deleted.
    await expect(
      removeExtraMatch(a.day.id, extraB.id, a.players[0].id),
    ).rejects.toBeInstanceOf(MatchNotFoundError);
    expect(await prisma.match.findUnique({ where: { id: extraB.id } })).not.toBeNull();
  });

  it("broadcasts a live update after a successful removal", async () => {
    const { players, day } = await setupFive();
    const extra = await addExtraMatch(day.id, players[0].id);
    const listener = vi.fn();
    subscribeToGameDay(day.id, listener);

    await removeExtraMatch(day.id, extra.id, players[0].id);

    expect(listener).toHaveBeenCalledTimes(1);
    __resetLiveBroadcastForTests();
  });

  it("does NOT broadcast when removal is rejected", async () => {
    const { players, day } = await setupFive();
    const template = await prisma.match.findFirstOrThrow({
      where: { gameDayId: day.id, matchNumber: 1 },
    });
    const listener = vi.fn();
    subscribeToGameDay(day.id, listener);

    await expect(
      removeExtraMatch(day.id, template.id, players[0].id),
    ).rejects.toBeInstanceOf(NotAnExtraMatchError);

    expect(listener).not.toHaveBeenCalled();
    __resetLiveBroadcastForTests();
  });
});
