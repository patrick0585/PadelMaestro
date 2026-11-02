import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { getSoleGroup } from "@/lib/group/sole-group";
import { resetDb } from "../helpers/reset-db";

describe("createGameDay", () => {
  beforeEach(resetDb);

  it("creates a game day with pending participants for all active players", async () => {
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "a@x", isAdmin: true, passwordHash: "x" },
    });
    await prisma.player.create({ data: { name: "B", email: "b@x", passwordHash: "x" } });

    const day = await createGameDay(new Date("2026-04-21"), admin.id);

    expect(day.status).toBe("planned");
    const season = await prisma.season.findUniqueOrThrow({ where: { id: day.seasonId } });
    expect(season.groupId).not.toBeNull();
    expect(day.groupId).toBe(season.groupId);
    const log = await prisma.auditLog.findFirst({
      where: { action: "game_day.create", entityId: day.id },
    });
    expect(log?.groupId).toBe(season.groupId);
    const parts = await prisma.gameDayParticipant.findMany({ where: { gameDayId: day.id } });
    expect(parts).toHaveLength(2);
    expect(parts.every((p) => p.attendance === "pending")).toBe(true);
  });

  it("falls back to the sole group when the season has no groupId", async () => {
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "a@x", isAdmin: true, passwordHash: "x" },
    });
    const year = new Date().getFullYear();
    await prisma.season.create({
      data: {
        name: "Ohne Gruppe",
        year,
        startDate: new Date(year, 0, 1),
        endDate: new Date(year, 11, 31),
        isActive: true,
        groupId: null,
      },
    });

    const day = await createGameDay(new Date("2026-04-21"), admin.id);

    const group = await getSoleGroup();
    expect(day.groupId).toBe(group.id);
    const log = await prisma.auditLog.findFirst({
      where: { action: "game_day.create", entityId: day.id },
    });
    expect(log?.groupId).toBe(group.id);
  });

  it("does not include soft-deleted players", async () => {
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "a@x", isAdmin: true, passwordHash: "x" },
    });
    await prisma.player.create({
      data: { name: "Gone", email: "gone@x", passwordHash: "x", deletedAt: new Date() },
    });

    const day = await createGameDay(new Date("2026-04-21"), admin.id);
    const parts = await prisma.gameDayParticipant.findMany({ where: { gameDayId: day.id } });
    expect(parts).toHaveLength(1);
  });
});
