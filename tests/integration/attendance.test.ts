import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import {
  setAttendance,
  setAttendanceAsAdmin,
  joinGameDay,
  GameDayNotFoundError,
  PlayerNotFoundError,
  GameDayLockedError,
} from "@/lib/game-day/attendance";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";

describe("setAttendance", () => {
  beforeEach(resetDb);

  it("updates attendance from pending to confirmed", async () => {
    const group = await createTestGroup();
    const admin = await createMember(group.id, {
      name: "A",
      email: "a@x",
      role: "owner",
      passwordHash: "x",
    });
    const day = await createGameDay(group.id, new Date("2026-04-21"), admin.id);

    await setAttendance(day.id, admin.id, "confirmed");

    const p = await prisma.gameDayParticipant.findUniqueOrThrow({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: admin.id } },
    });
    expect(p.attendance).toBe("confirmed");
    expect(p.respondedAt).toBeInstanceOf(Date);
  });

  it("rejects updates after roster is locked", async () => {
    const group = await createTestGroup();
    const admin = await createMember(group.id, {
      name: "A",
      email: "a@x",
      role: "owner",
      passwordHash: "x",
    });
    const day = await createGameDay(group.id, new Date("2026-04-21"), admin.id);
    await prisma.gameDay.update({ where: { id: day.id }, data: { status: "in_progress" } });

    await expect(setAttendance(day.id, admin.id, "confirmed")).rejects.toThrow(/locked/i);
  });
});

describe("setAttendanceAsAdmin", () => {
  beforeEach(resetDb);

  async function setup() {
    const group = await createTestGroup();
    const admin = await createMember(group.id, {
      name: "Admin",
      email: "admin@x",
      role: "owner",
      passwordHash: "x",
    });
    const other = await createMember(group.id, { name: "Ben", email: "ben@x", passwordHash: "x" });
    const day = await createGameDay(group.id, new Date("2026-04-21"), admin.id);
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
    expect(logs[0].groupId).toBe(day.groupId);
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

  it("creates a participant row for a player added after the game day", async () => {
    const { admin, day } = await setup();
    const outsider = await prisma.player.create({
      data: { name: "Outsider", email: "o@x", passwordHash: "x" },
    });
    // outsider was created AFTER the game day, so they aren't a participant yet
    const result = await setAttendanceAsAdmin(day.id, outsider.id, "confirmed", admin.id);
    expect(result.attendance).toBe("confirmed");
    expect(result.gameDayId).toBe(day.id);
    expect(result.playerId).toBe(outsider.id);
  });

  it("throws PlayerNotFoundError when the player is soft-deleted", async () => {
    const { admin, other, day } = await setup();
    await prisma.player.update({
      where: { id: other.id },
      data: { deletedAt: new Date() },
    });
    await expect(
      setAttendanceAsAdmin(day.id, other.id, "confirmed", admin.id),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("throws GameDayLockedError when the roster is already locked", async () => {
    const { admin, other, day } = await setup();
    await prisma.gameDay.update({
      where: { id: day.id },
      data: { status: "in_progress" },
    });
    await expect(
      setAttendanceAsAdmin(day.id, other.id, "confirmed", admin.id),
    ).rejects.toBeInstanceOf(GameDayLockedError);
  });
});

describe("joinGameDay", () => {
  beforeEach(resetDb);

  it("writes a self_join audit log carrying the group", async () => {
    const group = await createTestGroup();
    const creator = await createMember(group.id, { name: "C", email: "c@x", passwordHash: "x" });
    const day = await createGameDay(group.id, new Date("2026-04-21"), creator.id);
    const player = await createMember(group.id, { name: "J", email: "j@x", passwordHash: "x" });

    await joinGameDay(day.id, player.id);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "game_day.self_join" } });
    expect(log.groupId).toBe(group.id);
  });
});
