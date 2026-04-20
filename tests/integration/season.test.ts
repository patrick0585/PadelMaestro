import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { getOrCreateActiveSeason } from "@/lib/season";

describe("getOrCreateActiveSeason", () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.jokerUse.deleteMany();
    await prisma.match.deleteMany();
    await prisma.gameDayParticipant.deleteMany();
    await prisma.gameDay.deleteMany();
    await prisma.season.deleteMany();
  });

  it("creates the current-year season if none exists", async () => {
    const year = new Date().getFullYear();
    const s = await getOrCreateActiveSeason();
    expect(s.year).toBe(year);
    expect(s.isActive).toBe(true);
  });

  it("returns the existing active season on subsequent calls", async () => {
    const first = await getOrCreateActiveSeason();
    const second = await getOrCreateActiveSeason();
    expect(second.id).toBe(first.id);
  });
});
