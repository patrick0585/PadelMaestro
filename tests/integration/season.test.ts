import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getOrCreateActiveSeason } from "@/lib/season";
import { resetDb } from "../helpers/reset-db";
import { createTestGroup, createTestSeason } from "../helpers/group";

describe("getOrCreateActiveSeason", () => {
  beforeEach(resetDb);

  it("creates the current-year season if none exists", async () => {
    const group = await createTestGroup();
    const year = new Date().getFullYear();
    const s = await getOrCreateActiveSeason(group.id);
    expect(s.year).toBe(year);
    expect(s.isActive).toBe(true);
    expect(s.name).toBe(`Saison ${year}`);
    expect(s.groupId).toBe(group.id);
  });

  it("returns the existing active season on subsequent calls", async () => {
    const group = await createTestGroup();
    const first = await getOrCreateActiveSeason(group.id);
    const second = await getOrCreateActiveSeason(group.id);
    expect(second.id).toBe(first.id);
  });

  it("legt pro Gruppe eine eigene aktive Saison an (gleicher Name erlaubt)", async () => {
    const groupA = await createTestGroup("A");
    const groupB = await createTestGroup("B");
    const name = `Saison ${new Date().getFullYear()}`;
    const seasonB = await createTestSeason(groupB.id, { name });

    const seasonA = await getOrCreateActiveSeason(groupA.id);

    expect(seasonA.id).not.toBe(seasonB.id);
    expect(seasonA.groupId).toBe(groupA.id);
    expect(seasonA.isActive).toBe(true);
    expect(seasonA.name).toBe(name);
    expect((await getOrCreateActiveSeason(groupB.id)).id).toBe(seasonB.id);
    expect(await prisma.season.count({ where: { isActive: true } })).toBe(2);
  });

  it("liefert nach P2002 die bereits angelegte Saison", async () => {
    const group = await createTestGroup();
    const existing = await createTestSeason(group.id, { name: `Saison ${new Date().getFullYear()}` });
    const spy = vi.spyOn(prisma.season, "findFirst").mockResolvedValueOnce(null);
    try {
      const season = await getOrCreateActiveSeason(group.id);
      expect(season.id).toBe(existing.id);
    } finally {
      spy.mockRestore();
    }
  });

  it("liefert bei gleichzeitigen Aufrufen genau eine Saison", async () => {
    const group = await createTestGroup();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => getOrCreateActiveSeason(group.id)),
    );
    expect(await prisma.season.count({ where: { groupId: group.id } })).toBe(1);
    expect(new Set(results.map((s) => s.id)).size).toBe(1);
  });
});
