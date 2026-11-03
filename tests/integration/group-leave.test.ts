import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { leaveGroup } from "@/lib/group/leave";
import { findActiveMembership } from "@/lib/group/active-membership";
import { ActiveParticipationError } from "@/lib/players/delete";
import { LastAdminError, OwnerProtectedError } from "@/lib/players/errors";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGameDay, createTestGroup, createTestSeason } from "../helpers/group";

beforeEach(resetDb);

async function membershipOf(groupId: string, playerId: string) {
  return prisma.membership.findUniqueOrThrow({
    where: { groupId_playerId: { groupId, playerId } },
  });
}

describe("leaveGroup", () => {
  it("sets removedAt, clears activeGroupId, writes audit membership.leave, and the next findActiveMembership returns the other group", async () => {
    const a = await createTestGroup("A");
    const b = await createTestGroup("B");
    const me = await createMember(a.id, { name: "Me", email: "me@x.de", activeGroupId: a.id });
    await prisma.membership.create({
      data: { groupId: b.id, playerId: me.id, role: "admin", joinedAt: new Date(Date.now() - 86_400_000) },
    });

    await leaveGroup({ groupId: a.id, playerId: me.id });

    expect((await membershipOf(a.id, me.id)).removedAt).not.toBeNull();
    expect((await membershipOf(b.id, me.id)).removedAt).toBeNull();
    expect((await prisma.player.findUniqueOrThrow({ where: { id: me.id } })).activeGroupId).toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "membership.leave" } });
    expect(audit).toMatchObject({
      actorId: me.id,
      groupId: a.id,
      entityType: "Group",
      entityId: a.id,
      payload: { role: "member" },
    });
    expect((await findActiveMembership(prisma, me.id))?.groupId).toBe(b.id);
  });

  it("rejects owner, last admin, and confirmed participation on a planned day without changes", async () => {
    const g = await createTestGroup("G");
    const owner = await createMember(g.id, { name: "O", email: "o@x.de", role: "owner" });
    const admin = await createMember(g.id, { name: "A", email: "a@x.de", role: "admin" });
    const member = await createMember(g.id, { name: "M", email: "m@x.de", activeGroupId: g.id });

    await expect(leaveGroup({ groupId: g.id, playerId: owner.id })).rejects.toBeInstanceOf(OwnerProtectedError);

    // owner counts as other admin, so demote ownership away to test last admin
    await prisma.membership.update({
      where: { groupId_playerId: { groupId: g.id, playerId: owner.id } },
      data: { removedAt: new Date() },
    });
    await expect(leaveGroup({ groupId: g.id, playerId: admin.id })).rejects.toBeInstanceOf(LastAdminError);

    const season = await createTestSeason(g.id);
    const day = await createTestGameDay(g.id, season.id, { status: "planned" });
    await prisma.gameDayParticipant.create({
      data: { gameDayId: day.id, playerId: member.id, attendance: "confirmed" },
    });
    await expect(leaveGroup({ groupId: g.id, playerId: member.id })).rejects.toBeInstanceOf(ActiveParticipationError);

    for (const p of [admin, member]) expect((await membershipOf(g.id, p.id)).removedAt).toBeNull();
    expect((await membershipOf(g.id, owner.id)).removedAt).not.toBeNull();
    expect((await prisma.player.findUniqueOrThrow({ where: { id: member.id } })).activeGroupId).toBe(g.id);
    expect(await prisma.auditLog.count({ where: { action: "membership.leave" } })).toBe(0);
  });
});
