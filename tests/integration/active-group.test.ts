import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";
import { NotAMemberError, listMyGroups, setActiveGroup } from "@/lib/group/active-group";

beforeEach(resetDb);

describe("setActiveGroup", () => {
  it("stores the group for an active member and rejects a removed member and a stranger", async () => {
    const a = await createTestGroup("A");
    const b = await createTestGroup("B");
    const c = await createTestGroup("C");
    const me = await createMember(a.id, { name: "Me", email: "me@example.com" });
    await prisma.membership.create({ data: { groupId: b.id, playerId: me.id, role: "member" } });
    await prisma.membership.create({
      data: { groupId: c.id, playerId: me.id, role: "member", removedAt: new Date() },
    });

    await setActiveGroup({ playerId: me.id, groupId: b.id });
    expect((await prisma.player.findUniqueOrThrow({ where: { id: me.id } })).activeGroupId).toBe(b.id);

    await expect(setActiveGroup({ playerId: me.id, groupId: c.id })).rejects.toBeInstanceOf(NotAMemberError);
    const d = await createTestGroup("D");
    await expect(setActiveGroup({ playerId: me.id, groupId: d.id })).rejects.toBeInstanceOf(NotAMemberError);
    expect((await prisma.player.findUniqueOrThrow({ where: { id: me.id } })).activeGroupId).toBe(b.id);
  });
});

describe("listMyGroups", () => {
  it("lists only active memberships sorted by name with roles", async () => {
    const z = await createTestGroup("Zebra");
    const a = await createTestGroup("Anker");
    const x = await createTestGroup("Weg");
    const me = await createMember(z.id, { name: "Me", email: "me@example.com", role: "admin" });
    await prisma.membership.create({ data: { groupId: a.id, playerId: me.id, role: "owner" } });
    await prisma.membership.create({
      data: { groupId: x.id, playerId: me.id, role: "member", removedAt: new Date() },
    });
    expect(await listMyGroups(me.id)).toEqual([
      { id: a.id, name: "Anker", role: "owner" },
      { id: z.id, name: "Zebra", role: "admin" },
    ]);
  });
});
