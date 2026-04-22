import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { listArchivedGameDays } from "@/lib/archive/list";
import { resetDb } from "../helpers/reset-db";

async function makeSeason(year = new Date().getFullYear()) {
  return prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
}

async function makeUser(name: string) {
  return prisma.player.create({
    data: { name, email: `${name.toLowerCase()}@x`, passwordHash: "x" },
  });
}

describe("listArchivedGameDays", () => {
  beforeEach(resetDb);

  it("returns empty array when no finished days exist", async () => {
    const result = await listArchivedGameDays(null);
    expect(result).toEqual([]);
  });
});
