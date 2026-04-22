import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { deleteGameDay, GameDayNotDeletableError } from "@/lib/game-day/delete";
import { GameDayNotFoundError } from "@/lib/game-day/attendance";
import { resetDb } from "../../helpers/reset-db";

async function makeDay(status: "planned" | "roster_locked" | "in_progress" | "finished") {
  const admin = await prisma.player.create({
    data: { name: "A", email: `a-${status}@example.com`, passwordHash: "x", isAdmin: true },
  });
  const year = new Date().getFullYear();
  const season = await prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
  const day = await prisma.gameDay.create({
    data: { seasonId: season.id, date: new Date("2026-04-21"), status },
  });
  return { admin, day };
}

describe("deleteGameDay", () => {
  beforeEach(resetDb);

  it("deletes a planned day and writes an audit log entry", async () => {
    const { admin, day } = await makeDay("planned");
    await deleteGameDay(day.id, admin.id);

    expect(await prisma.gameDay.findUnique({ where: { id: day.id } })).toBeNull();
    const entries = await prisma.auditLog.findMany({
      where: { action: "game_day.delete", entityId: day.id },
    });
    expect(entries).toHaveLength(1);
  });

  it("deletes a roster_locked day", async () => {
    const { admin, day } = await makeDay("roster_locked");
    await deleteGameDay(day.id, admin.id);
    expect(await prisma.gameDay.findUnique({ where: { id: day.id } })).toBeNull();
  });

  it("rejects in_progress with GameDayNotDeletableError", async () => {
    const { admin, day } = await makeDay("in_progress");
    await expect(deleteGameDay(day.id, admin.id)).rejects.toBeInstanceOf(GameDayNotDeletableError);
  });

  it("rejects finished with GameDayNotDeletableError", async () => {
    const { admin, day } = await makeDay("finished");
    await expect(deleteGameDay(day.id, admin.id)).rejects.toBeInstanceOf(GameDayNotDeletableError);
  });

  it("throws GameDayNotFoundError for an unknown id", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    await expect(deleteGameDay("00000000-0000-0000-0000-000000000000", admin.id)).rejects.toBeInstanceOf(
      GameDayNotFoundError,
    );
  });
});
