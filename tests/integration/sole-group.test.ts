import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { AmbiguousGroupError, getSoleGroup } from "@/lib/group/sole-group";
import { resetDb } from "../helpers/reset-db";

describe("getSoleGroup", () => {
  beforeEach(resetDb);

  it("creates the default group when none exists", async () => {
    const g = await getSoleGroup();
    expect(g.slug).toBe("padelmaestro");
    expect(await prisma.group.count()).toBe(1);
  });

  it("returns the existing group", async () => {
    const a = await getSoleGroup();
    const b = await getSoleGroup();
    expect(b.id).toBe(a.id);
  });

  it("throws AmbiguousGroupError with two groups", async () => {
    await prisma.group.createMany({
      data: [
        { name: "A", slug: "a" },
        { name: "B", slug: "b" },
      ],
    });
    await expect(getSoleGroup()).rejects.toBeInstanceOf(AmbiguousGroupError);
  });
});
