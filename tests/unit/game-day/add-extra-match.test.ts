import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { startGameDay } from "@/lib/game-day/start";
import {
  addExtraMatch,
  GameDayNotActiveError,
} from "@/lib/game-day/add-extra-match";
import { removeExtraMatch } from "@/lib/game-day/remove-extra-match";
import { GameDayNotFoundError } from "@/lib/game-day/attendance";
import { resetDb } from "../../helpers/reset-db";

async function setupDay(count: number) {
  const players = [];
  for (let i = 1; i <= count; i++) {
    players.push(
      await prisma.player.create({
        data: { name: `P${i}`, email: `p${i}@example.com`, passwordHash: "x", isAdmin: i === 1 },
      }),
    );
  }
  const day = await createGameDay(new Date("2026-04-21"), players[0].id);
  for (const p of players) await setAttendance(day.id, p.id, "confirmed");
  await startGameDay(day.id, players[0].id);
  return { players, day };
}
const setupFive = () => setupDay(5);

function teamsOf(m: {
  team1PlayerAId: string;
  team1PlayerBId: string;
  team2PlayerAId: string;
  team2PlayerBId: string;
}) {
  return [m.team1PlayerAId, m.team1PlayerBId, m.team2PlayerAId, m.team2PlayerBId];
}

async function templateMatch(gameDayId: string, matchNumber: number) {
  return prisma.match.findUniqueOrThrow({
    where: { gameDayId_matchNumber: { gameDayId, matchNumber } },
  });
}

describe("addExtraMatch", () => {
  beforeEach(resetDb);

  it("creates a 16th match in in_progress and writes audit log", async () => {
    const { players, day } = await setupFive();
    const match = await addExtraMatch(day.id, players[0].id);

    expect(match.matchNumber).toBe(16);
    const entries = await prisma.auditLog.findMany({
      where: { action: "game_day.add_extra_match", entityId: match.id },
    });
    expect(entries).toHaveLength(1);
    // Payload records the picked teams so we can later reproduce why a
    // given extra match landed on the schedule.
    expect(entries[0].payload).toMatchObject({
      gameDayId: day.id,
      matchNumber: 16,
      sourceMatchNumber: 1,
      team1: expect.arrayContaining([expect.any(String)]),
      team2: expect.arrayContaining([expect.any(String)]),
    });
  });

  it("5 players: extra matches repeat the start plan from match 1", async () => {
    const { players, day } = await setupFive();
    const m16 = await addExtraMatch(day.id, players[0].id);
    const m17 = await addExtraMatch(day.id, players[0].id);
    expect(teamsOf(m16)).toEqual(teamsOf(await templateMatch(day.id, 1)));
    expect(teamsOf(m17)).toEqual(teamsOf(await templateMatch(day.id, 2)));
  });

  it("5 players: match 31 wraps around to match 1 again", async () => {
    const { players, day } = await setupFive();
    let last;
    for (let i = 16; i <= 31; i++) last = await addExtraMatch(day.id, players[0].id);
    expect(last!.matchNumber).toBe(31);
    expect(teamsOf(last!)).toEqual(teamsOf(await templateMatch(day.id, 1)));
  });

  it("4 players: extra match 4 repeats match 1", async () => {
    const { players, day } = await setupDay(4);
    const m4 = await addExtraMatch(day.id, players[0].id);
    expect(m4.matchNumber).toBe(4);
    expect(teamsOf(m4)).toEqual(teamsOf(await templateMatch(day.id, 1)));
  });

  it("5 players: after removing a middle extra, the cycle continues from the last match", async () => {
    const { players, day } = await setupFive();
    const m16 = await addExtraMatch(day.id, players[0].id); // copy of 1
    const m17 = await addExtraMatch(day.id, players[0].id); // copy of 2
    expect(teamsOf(m17)).toEqual(teamsOf(await templateMatch(day.id, 2)));

    // Removing m16 slides m17 down to matchNumber 16 (still a copy of 2).
    // The next extra must continue with match 3, not repeat match 2.
    await removeExtraMatch(day.id, m16.id, players[0].id);
    expect(teamsOf(await templateMatch(day.id, 16))).toEqual(
      teamsOf(await templateMatch(day.id, 2)),
    );

    const next = await addExtraMatch(day.id, players[0].id);
    expect(next.matchNumber).toBe(17);
    expect(teamsOf(next)).toEqual(teamsOf(await templateMatch(day.id, 3)));
  });

  it("6 players: still uses the fair picker (no template copy)", async () => {
    const { players, day } = await setupDay(6);
    const m16 = await addExtraMatch(day.id, players[0].id);
    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { action: "game_day.add_extra_match", entityId: m16.id },
    });
    expect(entry.payload).toMatchObject({ sourceMatchNumber: null });
    // Fair picker: on a slot-fair 15-match plan every player has 10
    // matches, so any 4 of the 6 confirmed players may be picked.
    const confirmedIds = new Set(players.map((p) => p.id));
    for (const id of teamsOf(m16)) expect(confirmedIds.has(id)).toBe(true);
  });

  it("creates a match in in_progress", async () => {
    const { players, day } = await setupFive();
    await prisma.gameDay.update({ where: { id: day.id }, data: { status: "in_progress" } });
    const match = await addExtraMatch(day.id, players[0].id);
    expect(match.matchNumber).toBe(16);
  });

  it("6 players: uses only confirmed players", async () => {
    const { players, day } = await setupDay(6);
    await prisma.gameDayParticipant.update({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: players[5].id } },
      data: { attendance: "declined" },
    });
    const confirmedIds = new Set(players.slice(0, 5).map((p) => p.id));

    const match = await addExtraMatch(day.id, players[0].id);
    for (const id of [
      match.team1PlayerAId,
      match.team1PlayerBId,
      match.team2PlayerAId,
      match.team2PlayerBId,
    ]) {
      expect(confirmedIds.has(id)).toBe(true);
    }
  });

  it("rejects in planned with GameDayNotActiveError", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    const day = await createGameDay(new Date("2026-04-21"), admin.id);
    await expect(addExtraMatch(day.id, admin.id)).rejects.toBeInstanceOf(GameDayNotActiveError);
  });

  it("rejects in finished with GameDayNotActiveError", async () => {
    const { players, day } = await setupFive();
    await prisma.gameDay.update({ where: { id: day.id }, data: { status: "finished" } });
    await expect(addExtraMatch(day.id, players[0].id)).rejects.toBeInstanceOf(GameDayNotActiveError);
  });

  it("throws GameDayNotFoundError for an unknown id", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    await expect(
      addExtraMatch("00000000-0000-0000-0000-000000000000", admin.id),
    ).rejects.toBeInstanceOf(GameDayNotFoundError);
  });
});
