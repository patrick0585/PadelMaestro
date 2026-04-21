import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import {
  setAttendance,
  setAttendanceAsAdmin,
  GameDayNotFoundError,
  ParticipantNotFoundError,
  GameDayLockedError,
} from "@/lib/game-day/attendance";
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

describe("setAttendanceAsAdmin", () => {
  beforeEach(resetDb);

  async function setup() {
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "admin@x", isAdmin: true, passwordHash: "x" },
    });
    const other = await prisma.player.create({
      data: { name: "Ben", email: "ben@x", isAdmin: false, passwordHash: "x" },
    });
    const day = await createGameDay(new Date("2026-04-21"), admin.id);
    return { admin, other, day };
  }

  it("updates another player's attendance and writes an audit log", async () => {
    const { admin, other, day } = await setup();

    const updated = await setAttendanceAsAdmin(day.id, other.id, "confirmed", admin.id);

    expect(updated.attendance).toBe("confirmed");
    expect(updated.respondedAt).toBeInstanceOf(Date);

    const logs = await prisma.auditLog.findMany({
      where: { action: "game_day.admin_set_attendance" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(admin.id);
    expect(logs[0].entityId).toBe(updated.id);
    expect(logs[0].payload).toMatchObject({
      gameDayId: day.id,
      playerId: other.id,
      attendance: "confirmed",
      previousAttendance: "pending",
    });
  });

  it("throws GameDayNotFoundError when the game day does not exist", async () => {
    const { admin } = await setup();
    await expect(
      setAttendanceAsAdmin("00000000-0000-0000-0000-000000000000", admin.id, "confirmed", admin.id),
    ).rejects.toBeInstanceOf(GameDayNotFoundError);
  });

  it("throws ParticipantNotFoundError when the player is not a participant", async () => {
    const { admin, day } = await setup();
    const outsider = await prisma.player.create({
      data: { name: "Outsider", email: "o@x", passwordHash: "x" },
    });
    // outsider was created AFTER the game day, so they aren't a participant
    await expect(
      setAttendanceAsAdmin(day.id, outsider.id, "confirmed", admin.id),
    ).rejects.toBeInstanceOf(ParticipantNotFoundError);
  });

  it("throws GameDayLockedError when the roster is already locked", async () => {
    const { admin, other, day } = await setup();
    await prisma.gameDay.update({
      where: { id: day.id },
      data: { status: "roster_locked" },
    });
    await expect(
      setAttendanceAsAdmin(day.id, other.id, "confirmed", admin.id),
    ).rejects.toBeInstanceOf(GameDayLockedError);
  });
});
