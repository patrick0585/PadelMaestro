import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { AmbiguousGroupError } from "@/lib/group/sole-group";
import { GroupNotFoundError, resolveGroup, splitArgs } from "@/lib/group/resolve-group";
import { resetDb } from "../helpers/reset-db";

describe("resolveGroup", () => {
  beforeEach(resetDb);

  it("returns the group for --group <slug>, throws GroupNotFoundError for an unknown slug, and falls back to getSoleGroup", async () => {
    const a = await prisma.group.create({ data: { name: "A", slug: "a" } });
    await prisma.group.create({ data: { name: "B", slug: "b" } });

    expect((await resolveGroup(["--group", "a"])).id).toBe(a.id);
    expect((await resolveGroup(["x.json", "--group", "a", "--yes"])).id).toBe(a.id);
    await expect(resolveGroup(["--group", "nope"])).rejects.toBeInstanceOf(GroupNotFoundError);
    await expect(resolveGroup([])).rejects.toBeInstanceOf(AmbiguousGroupError);
    await expect(resolveGroup([])).rejects.toThrow("--group <slug>");

    await prisma.group.delete({ where: { slug: "b" } });
    expect((await resolveGroup([])).id).toBe(a.id);
  });

  it("splitArgs keeps positionals in either order", () => {
    expect(splitArgs(["f.json", "--group", "a"])).toEqual({ group: "a", positionals: ["f.json"] });
    expect(splitArgs(["--group", "a", "f.json"])).toEqual({ group: "a", positionals: ["f.json"] });
    expect(splitArgs(["--yes", "f.json"])).toEqual({ group: undefined, positionals: ["f.json"] });
  });
});
