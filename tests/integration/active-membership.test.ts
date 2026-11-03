import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { findActiveMembership } from "@/lib/group/active-membership";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";

async function twoGroups() {
  const older = await createTestGroup("Alt");
  const newer = await createTestGroup("Neu");
  const player = await createMember(older.id, { name: "P", email: "p@example.com" });
  await prisma.membership.updateMany({
    where: { playerId: player.id },
    data: { joinedAt: new Date("2025-01-01") },
  });
  await prisma.membership.create({
    data: { groupId: newer.id, playerId: player.id, role: "admin", joinedAt: new Date("2026-01-01") },
  });
  return { older, newer, player };
}

describe("findActiveMembership", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns the membership of activeGroupId when it is active", async () => {
    const { older, player } = await twoGroups();
    await prisma.player.update({ where: { id: player.id }, data: { activeGroupId: older.id } });
    expect(await findActiveMembership(prisma, player.id)).toEqual({
      groupId: older.id,
      role: "member",
    });
  });

  it("falls back to the newest membership when activeGroupId points to a removed membership", async () => {
    const { older, newer, player } = await twoGroups();
    await prisma.membership.updateMany({
      where: { playerId: player.id, groupId: older.id },
      data: { removedAt: new Date() },
    });
    await prisma.player.update({ where: { id: player.id }, data: { activeGroupId: older.id } });
    expect(await findActiveMembership(prisma, player.id)).toEqual({
      groupId: newer.id,
      role: "admin",
    });
  });

  it("falls back to the newest membership when activeGroupId is null and to null without memberships", async () => {
    const { newer, player } = await twoGroups();
    expect(await findActiveMembership(prisma, player.id)).toEqual({
      groupId: newer.id,
      role: "admin",
    });
    const loner = await prisma.player.create({ data: { name: "L", email: "l@example.com" } });
    expect(await findActiveMembership(prisma, loner.id)).toBeNull();
  });

  it("ignores an activeGroupId of a group the player never joined", async () => {
    const { newer, player } = await twoGroups();
    const foreign = await createTestGroup("Fremd");
    await prisma.player.update({ where: { id: player.id }, data: { activeGroupId: foreign.id } });
    expect(await findActiveMembership(prisma, player.id)).toEqual({
      groupId: newer.id,
      role: "admin",
    });
  });
});
