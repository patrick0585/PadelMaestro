import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  finishGameDay,
  GameDayAlreadyFinishedError,
} from "@/lib/game-day/finish";
import { GameDayNotActiveError } from "@/lib/game-day/add-extra-match";
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

describe("finishGameDay", () => {
  beforeEach(resetDb);

  it("flips in_progress to finished and writes audit log", async () => {
    const { admin, day } = await makeDay("in_progress");
    await finishGameDay(day.id, admin.id);
    const after = await prisma.gameDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(after.status).toBe("finished");
    const entries = await prisma.auditLog.findMany({
      where: { action: "game_day.finish", entityId: day.id },
    });
    expect(entries).toHaveLength(1);
  });

  it("throws GameDayAlreadyFinishedError on finished", async () => {
    const { admin, day } = await makeDay("finished");
    await expect(finishGameDay(day.id, admin.id)).rejects.toBeInstanceOf(
      GameDayAlreadyFinishedError,
    );
  });

  it("throws GameDayNotActiveError on planned", async () => {
    const { admin, day } = await makeDay("planned");
    await expect(finishGameDay(day.id, admin.id)).rejects.toBeInstanceOf(GameDayNotActiveError);
  });

  it("throws GameDayNotActiveError on roster_locked", async () => {
    const { admin, day } = await makeDay("roster_locked");
    await expect(finishGameDay(day.id, admin.id)).rejects.toBeInstanceOf(GameDayNotActiveError);
  });

  it("throws GameDayNotFoundError for unknown id", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    await expect(
      finishGameDay("00000000-0000-0000-0000-000000000000", admin.id),
    ).rejects.toBeInstanceOf(GameDayNotFoundError);
  });
});
