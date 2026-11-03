import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { seedDemo } from "../../scripts/seed-demo";

describe("seedDemo", () => {
  beforeEach(resetDb);

  it("creates verified demo players with memberships in the given group", async () => {
    await prisma.group.create({ data: { name: "Eins", slug: "eins" } });
    const group = await prisma.group.create({ data: { name: "Zwei", slug: "zwei" } });
    await seedDemo(group.id, { confirmAll: false });
    const players = await prisma.player.findMany({ where: { email: { endsWith: "@demo.local" } } });
    expect(players).toHaveLength(5);
    expect(players.every((p) => p.emailVerifiedAt !== null)).toBe(true);
    expect(await prisma.membership.count({ where: { groupId: group.id } })).toBe(5);
  });

  it("verifies existing unverified demo players on re-run", async () => {
    const group = await prisma.group.create({ data: { name: "Eins", slug: "eins" } });
    await prisma.player.create({ data: { name: "Anna", email: "anna@demo.local" } });
    await seedDemo(group.id, { confirmAll: false });
    const anna = await prisma.player.findUniqueOrThrow({ where: { email: "anna@demo.local" } });
    expect(anna.emailVerifiedAt).not.toBeNull();
  });
});
