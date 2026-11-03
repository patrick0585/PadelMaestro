import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/hash";
import { resetDb } from "../helpers/reset-db";
import {
  createTestGroup,
  createMember,
  createTestSeason,
  createTestGameDay,
} from "../helpers/group";
import { deleteGroup, NameMismatchError, WrongPasswordError } from "@/lib/group/delete";
import { ForbiddenError } from "@/lib/auth/group-context";

const PASSWORD = "geheim-123";
const DAY = 24 * 60 * 60 * 1000;

function invitationData(kind: "founder" | "member", groupId: string | null, createdById: string | null) {
  return {
    kind,
    groupId,
    createdById,
    tokenHash: randomBytes(16).toString("hex"),
    expiresAt: new Date(Date.now() + 7 * DAY),
    usedCount: 1,
  };
}

async function seedGroupWithData(name: string, owner: { id: string } | null, passwordHash: string | null) {
  const group = await createTestGroup(name);
  const tag = group.slug;
  const ownerPlayer =
    owner ??
    (await createMember(group.id, {
      name: `Owner ${name}`,
      email: `owner-${tag}@example.com`,
      role: "owner",
      passwordHash,
      activeGroupId: group.id,
    }));
  const members = [];
  for (let i = 0; i < 4; i++) {
    members.push(
      await createMember(group.id, {
        name: `Spieler ${i} ${name}`,
        email: `p${i}-${tag}@example.com`,
        activeGroupId: group.id,
      }),
    );
  }
  const season = await createTestSeason(group.id);
  const planned = await createTestGameDay(group.id, season.id, {
    date: new Date(Date.UTC(2026, 10, 10)),
    status: "planned",
  });
  const finished = await createTestGameDay(group.id, season.id, {
    date: new Date(Date.UTC(2026, 10, 3)),
    status: "finished",
  });
  for (const gd of [planned, finished]) {
    await prisma.gameDayParticipant.createMany({
      data: members.map((m) => ({ gameDayId: gd.id, playerId: m.id, attendance: "confirmed" as const })),
    });
  }
  await prisma.match.create({
    data: {
      gameDayId: finished.id,
      matchNumber: 1,
      team1PlayerAId: members[0].id,
      team1PlayerBId: members[1].id,
      team2PlayerAId: members[2].id,
      team2PlayerBId: members[3].id,
      team1Score: 3,
      team2Score: 1,
      scoredById: members[0].id,
      scoredAt: new Date(),
    },
  });
  await prisma.jokerUse.create({
    data: {
      playerId: members[3].id,
      seasonId: season.id,
      gameDayId: finished.id,
      ppgAtUse: new Prisma.Decimal("1.500"),
      pointsCredited: new Prisma.Decimal("22.50"),
    },
  });
  const inv = await prisma.invitation.create({ data: invitationData("member", group.id, ownerPlayer.id) });
  await prisma.invitationUse.create({ data: { invitationId: inv.id, playerId: members[0].id } });
  await prisma.auditLog.create({
    data: {
      groupId: group.id,
      actorId: ownerPlayer.id,
      action: "game_day.create",
      entityType: "GameDay",
      entityId: planned.id,
    },
  });
  return { group, owner: ownerPlayer, members, season, planned, finished };
}

async function countsFor(groupId: string) {
  return {
    jokerUses: await prisma.jokerUse.count({ where: { gameDay: { groupId } } }),
    matches: await prisma.match.count({ where: { gameDay: { groupId } } }),
    participants: await prisma.gameDayParticipant.count({ where: { gameDay: { groupId } } }),
    gameDays: await prisma.gameDay.count({ where: { groupId } }),
    seasons: await prisma.season.count({ where: { groupId } }),
    invitationUses: await prisma.invitationUse.count({ where: { invitation: { groupId } } }),
    invitations: await prisma.invitation.count({ where: { groupId } }),
    memberships: await prisma.membership.count({ where: { groupId } }),
    auditLogs: await prisma.auditLog.count({ where: { groupId } }),
    groups: await prisma.group.count({ where: { id: groupId } }),
  };
}

async function setup() {
  const passwordHash = await hashPassword(PASSWORD);
  const a = await seedGroupWithData("Gruppe A", null, passwordHash);
  const b = await seedGroupWithData("Gruppe B", null, null);

  // Founder invitation (global) whose use founded group A.
  const founderInv = await prisma.invitation.create({ data: invitationData("founder", null, null) });
  const founderUse = await prisma.invitationUse.create({
    data: { invitationId: founderInv.id, playerId: a.owner.id, foundedGroupId: a.group.id },
  });
  // Avatar on a member of A must survive.
  await prisma.player.update({
    where: { id: a.members[0].id },
    data: { avatarData: Buffer.from([1, 2, 3]), avatarMimeType: "image/png", avatarVersion: 2 },
  });
  // A member of A who is also in B and has A active.
  await prisma.membership.create({ data: { groupId: b.group.id, playerId: a.members[1].id } });
  // Global audit row (groupId null) must survive.
  await prisma.auditLog.create({
    data: { groupId: null, actorId: a.owner.id, action: "player.signup", entityType: "Player", entityId: a.owner.id },
  });
  return { a, b, founderInv, founderUse };
}

beforeEach(resetDb);

describe("deleteGroup", () => {
  it("deleteGroup removes jokers, matches, participants, game days, seasons, invitations and uses, memberships, the group's audit rows and the group; writes a global audit group.delete with counts", async () => {
    const { a } = await setup();
    const before = await countsFor(a.group.id);
    expect(before).toEqual({
      jokerUses: 1,
      matches: 1,
      participants: 8,
      gameDays: 2,
      seasons: 1,
      invitationUses: 1,
      invitations: 1,
      memberships: 5,
      auditLogs: 1,
      groups: 1,
    });

    await deleteGroup({ groupId: a.group.id, actorId: a.owner.id, name: "Gruppe A", password: PASSWORD });

    expect(await countsFor(a.group.id)).toEqual({
      jokerUses: 0,
      matches: 0,
      participants: 0,
      gameDays: 0,
      seasons: 0,
      invitationUses: 0,
      invitations: 0,
      memberships: 0,
      auditLogs: 0,
      groups: 0,
    });

    const audit = await prisma.auditLog.findMany({ where: { action: "group.delete" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      groupId: null,
      actorId: a.owner.id,
      entityType: "Group",
      entityId: a.group.id,
      payload: { name: "Gruppe A", slug: a.group.slug, members: 5, gameDays: 2 },
    });
  });

  it("deleteGroup leaves another group, its players, avatars and founder InvitationUse rows untouched; foundedGroupId becomes null; members' activeGroupId becomes null", async () => {
    const { a, b, founderInv, founderUse } = await setup();
    const bBefore = await countsFor(b.group.id);
    const playersBefore = await prisma.player.count();

    await deleteGroup({ groupId: a.group.id, actorId: a.owner.id, name: "Gruppe A", password: PASSWORD });

    expect(await countsFor(b.group.id)).toEqual(bBefore);
    expect(await prisma.player.count()).toBe(playersBefore);

    const avatar = await prisma.player.findUniqueOrThrow({ where: { id: a.members[0].id } });
    expect(Buffer.from(avatar.avatarData!)).toEqual(Buffer.from([1, 2, 3]));
    expect(avatar.avatarMimeType).toBe("image/png");
    expect(avatar.avatarVersion).toBe(2);

    expect(await prisma.invitation.findUnique({ where: { id: founderInv.id } })).not.toBeNull();
    const use = await prisma.invitationUse.findUniqueOrThrow({ where: { id: founderUse.id } });
    expect(use.foundedGroupId).toBeNull();

    const formerMembers = await prisma.player.findMany({
      where: { id: { in: [a.owner.id, ...a.members.map((m) => m.id)] } },
      select: { activeGroupId: true },
    });
    expect(formerMembers.map((p) => p.activeGroupId)).toEqual(formerMembers.map(() => null));
    const bMembers = await prisma.player.findMany({
      where: { id: { in: [b.owner.id, ...b.members.map((m) => m.id)] } },
      select: { activeGroupId: true },
    });
    expect(bMembers.every((p) => p.activeGroupId === b.group.id)).toBe(true);
    expect(
      await prisma.membership.findUnique({
        where: { groupId_playerId: { groupId: b.group.id, playerId: a.members[1].id } },
      }),
    ).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "player.signup" } })).toBe(1);
  });

  it("deleteGroup rejects wrong name, wrong password, account without password, and a non-owner actor without deleting anything", async () => {
    const { a, b } = await setup();
    const before = await countsFor(a.group.id);
    const admin = await createMember(a.group.id, {
      name: "Armin",
      email: "armin@example.com",
      role: "admin",
      passwordHash: await hashPassword(PASSWORD),
    });
    const withAdmin = { ...before, memberships: before.memberships + 1 };

    await expect(
      deleteGroup({ groupId: a.group.id, actorId: a.owner.id, name: "gruppe a", password: PASSWORD }),
    ).rejects.toBeInstanceOf(NameMismatchError);
    await expect(
      deleteGroup({ groupId: a.group.id, actorId: a.owner.id, name: " Gruppe A", password: PASSWORD }),
    ).rejects.toBeInstanceOf(NameMismatchError);
    await expect(
      deleteGroup({ groupId: a.group.id, actorId: a.owner.id, name: "Gruppe A", password: "falsch" }),
    ).rejects.toBeInstanceOf(WrongPasswordError);
    // B's owner has no password.
    await expect(
      deleteGroup({ groupId: b.group.id, actorId: b.owner.id, name: "Gruppe B", password: PASSWORD }),
    ).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(
      deleteGroup({ groupId: a.group.id, actorId: admin.id, name: "Gruppe A", password: PASSWORD }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // Owner of B is not owner of A.
    await expect(
      deleteGroup({ groupId: a.group.id, actorId: b.owner.id, name: "Gruppe A", password: PASSWORD }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await countsFor(a.group.id)).toEqual(withAdmin);
    expect(await prisma.auditLog.count({ where: { action: "group.delete" } })).toBe(0);
  });
});
