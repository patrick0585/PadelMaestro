import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createTestGroup, createMember } from "../helpers/group";
import { transferOwnership, SelfTransferError, TargetCannotLoginError } from "@/lib/group/transfer";
import { ForbiddenError } from "@/lib/auth/group-context";
import { OwnerProtectedError, PlayerNotFoundError } from "@/lib/players/errors";
import { updatePlayer } from "@/lib/players/update";
import { deletePlayer } from "@/lib/players/delete";

async function setup() {
  const group = await createTestGroup();
  const owner = await createMember(group.id, {
    name: "Olga",
    email: "o@example.com",
    role: "owner",
    passwordHash: "x",
  });
  const target = await createMember(group.id, {
    name: "Martin",
    email: "m@example.com",
    passwordHash: "x",
  });
  return { group, owner, target };
}

async function roleOf(groupId: string, playerId: string) {
  const m = await prisma.membership.findUniqueOrThrow({
    where: { groupId_playerId: { groupId, playerId } },
  });
  return m.role;
}

async function activeOwners(groupId: string) {
  return prisma.membership.count({ where: { groupId, role: "owner", removedAt: null } });
}

beforeEach(resetDb);

describe("transferOwnership", () => {
  it("transferOwnership makes the target owner, the actor admin, writes audit, and exactly one owner remains", async () => {
    const { group, owner, target } = await setup();

    await transferOwnership({ groupId: group.id, actorId: owner.id, newOwnerId: target.id });

    expect(await roleOf(group.id, target.id)).toBe("owner");
    expect(await roleOf(group.id, owner.id)).toBe("admin");
    expect(await activeOwners(group.id)).toBe(1);
    const audit = await prisma.auditLog.findMany({ where: { action: "group.transfer_owner" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      groupId: group.id,
      actorId: owner.id,
      entityType: "Group",
      entityId: group.id,
      payload: { from: owner.id, to: target.id },
    });
  });

  it("transferOwnership rejects a non-owner actor, a removed target, a stranger, and self", async () => {
    const { group, owner, target } = await setup();
    const admin = await createMember(group.id, { name: "Armin", email: "a@example.com", role: "admin" });
    const removed = await createMember(group.id, { name: "Rolf", email: "r@example.com" });
    await prisma.membership.update({
      where: { groupId_playerId: { groupId: group.id, playerId: removed.id } },
      data: { removedAt: new Date() },
    });
    const other = await createTestGroup("Andere");
    const stranger = await createMember(other.id, { name: "Sven", email: "s@example.com" });

    await expect(
      transferOwnership({ groupId: group.id, actorId: admin.id, newOwnerId: target.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      transferOwnership({ groupId: group.id, actorId: owner.id, newOwnerId: removed.id }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
    await expect(
      transferOwnership({ groupId: group.id, actorId: owner.id, newOwnerId: stranger.id }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
    await expect(
      transferOwnership({ groupId: group.id, actorId: owner.id, newOwnerId: owner.id }),
    ).rejects.toBeInstanceOf(SelfTransferError);

    expect(await roleOf(group.id, owner.id)).toBe("owner");
    expect(await roleOf(group.id, target.id)).toBe("member");
    expect(await roleOf(group.id, admin.id)).toBe("admin");
    expect(await roleOf(group.id, removed.id)).toBe("member");
    expect(await activeOwners(group.id)).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "group.transfer_owner" } })).toBe(0);
  });

  it("transferOwnership rejects a target without password or a deleted account", async () => {
    const { group, owner } = await setup();
    const statsOnly = await createMember(group.id, { name: "Stats", email: "s@example.com" });
    const deleted = await createMember(group.id, {
      name: "Del",
      email: "d@example.com",
      passwordHash: "x",
    });
    await prisma.player.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

    for (const target of [statsOnly, deleted]) {
      await expect(
        transferOwnership({ groupId: group.id, actorId: owner.id, newOwnerId: target.id }),
      ).rejects.toBeInstanceOf(TargetCannotLoginError);
      expect(await roleOf(group.id, target.id)).toBe("member");
    }
    expect(await roleOf(group.id, owner.id)).toBe("owner");
    expect(await prisma.auditLog.count({ where: { action: "group.transfer_owner" } })).toBe(0);
  });

  it("concurrent transfer and removal of the target: exactly one owner remains (allSettled)", async () => {
    const { group, owner, target } = await setup();

    const results = await Promise.allSettled([
      transferOwnership({ groupId: group.id, actorId: owner.id, newOwnerId: target.id }),
      deletePlayer({ groupId: group.id, playerId: target.id, actorId: owner.id }),
    ]);

    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(await activeOwners(group.id)).toBe(1);
    const owners = await prisma.membership.findMany({
      where: { groupId: group.id, role: "owner" },
    });
    expect(owners.filter((m) => m.removedAt === null)).toHaveLength(1);
  });

  it("removal blocked behind an uncommitted promotion does not remove the new owner", async () => {
    const { group, owner, target } = await setup();

    const [p, r] = await whileLocked(promoteInTx(group.id, owner.id, target.id), () =>
      deletePlayer({ groupId: group.id, playerId: target.id, actorId: owner.id }),
    );

    expect(p.status).toBe("fulfilled");
    expect(r.status).toBe("rejected");
    expect((r as PromiseRejectedResult).reason).toBeInstanceOf(OwnerProtectedError);
    expect(await activeOwners(group.id)).toBe(1);
    expect(await roleOf(group.id, target.id)).toBe("owner");
  });

  it("removal blocked behind an uncommitted removal reports not found", async () => {
    const { group, owner, target } = await setup();

    const [p, r] = await whileLocked(
      (tx) =>
        tx.membership.updateMany({
          where: { groupId: group.id, playerId: target.id },
          data: { removedAt: new Date() },
        }),
      () => deletePlayer({ groupId: group.id, playerId: target.id, actorId: owner.id }),
    );

    expect(p.status).toBe("fulfilled");
    expect(r.status).toBe("rejected");
    expect((r as PromiseRejectedResult).reason).toBeInstanceOf(PlayerNotFoundError);
  });

  it("role change blocked behind an uncommitted promotion does not demote the new owner", async () => {
    const { group, owner, target } = await setup();
    const admin = await createMember(group.id, { name: "Armin", email: "a@example.com", role: "admin" });

    const [p, r] = await whileLocked(promoteInTx(group.id, owner.id, target.id), () =>
      updatePlayer({
        groupId: group.id,
        playerId: target.id,
        actorId: admin.id,
        fields: { role: "admin" },
      }),
    );

    expect(p.status).toBe("fulfilled");
    expect(r.status).toBe("rejected");
    expect((r as PromiseRejectedResult).reason).toBeInstanceOf(OwnerProtectedError);
    expect(await activeOwners(group.id)).toBe(1);
    expect(await roleOf(group.id, target.id)).toBe("owner");
  });
});

// Same writes as transferOwnership.
function promoteInTx(groupId: string, ownerId: string, targetId: string) {
  return async (tx: Prisma.TransactionClient) => {
    await tx.membership.updateMany({
      where: { groupId, playerId: targetId, removedAt: null },
      data: { role: "owner" },
    });
    await tx.membership.updateMany({
      where: { groupId, playerId: ownerId, role: "owner" },
      data: { role: "admin" },
    });
  };
}

// Runs `writes` in a transaction that stays open until `contender` has read the old state
// and is blocked on the row lock, then commits.
async function whileLocked(
  writes: (tx: Prisma.TransactionClient) => Promise<unknown>,
  contender: () => Promise<unknown>,
) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let locked!: () => void;
  const lockHeld = new Promise<void>((r) => (locked = r));
  const holder = prisma.$transaction(
    async (tx) => {
      await writes(tx);
      locked();
      await gate;
    },
    { timeout: 10_000 },
  );
  await lockHeld;
  const contended = contender();
  await new Promise((r) => setTimeout(r, 300));
  release();
  return Promise.allSettled([holder, contended]);
}
