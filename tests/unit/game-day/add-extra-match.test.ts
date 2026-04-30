import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { startGameDay } from "@/lib/game-day/start";
import {
  addExtraMatch,
  GameDayNotActiveError,
} from "@/lib/game-day/add-extra-match";
import { GameDayNotFoundError } from "@/lib/game-day/attendance";
import { resetDb } from "../../helpers/reset-db";

async function setupFive() {
  const players = [];
  for (let i = 1; i <= 5; i++) {
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
  });

  it("creates a match in in_progress", async () => {
    const { players, day } = await setupFive();
    await prisma.gameDay.update({ where: { id: day.id }, data: { status: "in_progress" } });
    const match = await addExtraMatch(day.id, players[0].id);
    expect(match.matchNumber).toBe(16);
  });

  it("uses only confirmed players", async () => {
    const { players, day } = await setupFive();
    await prisma.gameDayParticipant.update({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: players[4].id } },
      data: { attendance: "declined" },
    });
    const confirmedIds = new Set(players.slice(0, 4).map((p) => p.id));

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
