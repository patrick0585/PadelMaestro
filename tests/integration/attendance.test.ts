import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { resetDb } from "../helpers/reset-db";

describe("setAttendance", () => {
  beforeEach(resetDb);

  it("updates attendance from pending to confirmed", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@x", isAdmin: true, passwordHash: "x" },
    });
    const day = await createGameDay(new Date("2026-04-21"), admin.id);

    await setAttendance(day.id, admin.id, "confirmed");

    const p = await prisma.gameDayParticipant.findUniqueOrThrow({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: admin.id } },
    });
    expect(p.attendance).toBe("confirmed");
    expect(p.respondedAt).toBeInstanceOf(Date);
  });

  it("rejects updates after roster is locked", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@x", isAdmin: true, passwordHash: "x" },
    });
    const day = await createGameDay(new Date("2026-04-21"), admin.id);
    await prisma.gameDay.update({ where: { id: day.id }, data: { status: "roster_locked" } });

    await expect(setAttendance(day.id, admin.id, "confirmed")).rejects.toThrow(/locked/i);
  });
});
