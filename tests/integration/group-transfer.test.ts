import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createTestGroup, createMember } from "../helpers/group";
import { transferOwnership, SelfTransferError } from "@/lib/group/transfer";
import { ForbiddenError } from "@/lib/auth/group-context";
import { PlayerNotFoundError } from "@/lib/players/errors";
import { deletePlayer } from "@/lib/players/delete";

async function setup() {
  const group = await createTestGroup();
  const owner = await createMember(group.id, { name: "Olga", email: "o@example.com", role: "owner" });
  const target = await createMember(group.id, { name: "Martin", email: "m@example.com" });
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
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const lockHeld = new Promise<void>((r) => (locked = r));

    // Same writes as transferOwnership, held open until deletePlayer has read the old role.
    const promotion = prisma.$transaction(
      async (tx) => {
        await tx.membership.updateMany({
          where: { groupId: group.id, playerId: target.id, removedAt: null },
          data: { role: "owner" },
        });
        await tx.membership.updateMany({
          where: { groupId: group.id, playerId: owner.id, role: "owner" },
          data: { role: "admin" },
        });
        locked();
        await gate;
      },
      { timeout: 10_000 },
    );
    await lockHeld;
    const removal = deletePlayer({ groupId: group.id, playerId: target.id, actorId: owner.id });
    await new Promise((r) => setTimeout(r, 300));
    release();
    const [p, r] = await Promise.allSettled([promotion, removal]);

    expect(p.status).toBe("fulfilled");
    expect(r.status).toBe("rejected");
    expect(await activeOwners(group.id)).toBe(1);
    expect(await roleOf(group.id, target.id)).toBe("owner");
  });
});
