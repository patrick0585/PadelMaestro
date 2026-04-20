import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";

async function resetDb() {
  await prisma.auditLog.deleteMany();
  await prisma.jokerUse.deleteMany();
  await prisma.match.deleteMany();
  await prisma.gameDayParticipant.deleteMany();
  await prisma.gameDay.deleteMany();
  await prisma.season.deleteMany();
  await prisma.player.deleteMany();
}

describe("createGameDay", () => {
  beforeEach(resetDb);

  it("creates a game day with pending participants for all active players", async () => {
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "a@x", isAdmin: true, passwordHash: "x" },
    });
    await prisma.player.create({ data: { name: "B", email: "b@x", passwordHash: "x" } });

    const day = await createGameDay(new Date("2026-04-21"), admin.id);

    expect(day.status).toBe("planned");
    const parts = await prisma.gameDayParticipant.findMany({ where: { gameDayId: day.id } });
    expect(parts).toHaveLength(2);
    expect(parts.every((p) => p.attendance === "pending")).toBe(true);
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
