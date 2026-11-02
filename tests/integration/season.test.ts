import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { getOrCreateActiveSeason } from "@/lib/season";
import { AmbiguousGroupError, getSoleGroup } from "@/lib/group/sole-group";
import { resetDb } from "../helpers/reset-db";

describe("getOrCreateActiveSeason", () => {
  beforeEach(resetDb);

  it("creates the current-year season if none exists", async () => {
    const year = new Date().getFullYear();
    const s = await getOrCreateActiveSeason();
    expect(s.year).toBe(year);
    expect(s.isActive).toBe(true);
    expect(s.name).toBe(`Saison ${year}`);
    expect(s.groupId).toBe((await getSoleGroup()).id);
  });

  it("returns the existing active season on subsequent calls", async () => {
    const first = await getOrCreateActiveSeason();
    const second = await getOrCreateActiveSeason();
    expect(second.id).toBe(first.id);
  });

  it("rejects with AmbiguousGroupError when two groups exist and no active season", async () => {
    await prisma.group.createMany({
      data: [
        { name: "A", slug: "a" },
        { name: "B", slug: "b" },
      ],
    });
    await expect(getOrCreateActiveSeason()).rejects.toBeInstanceOf(AmbiguousGroupError);
    expect(await prisma.season.count()).toBe(0);
  });
});
