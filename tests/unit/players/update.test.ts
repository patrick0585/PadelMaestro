import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  updatePlayer,
  PlayerNotFoundError,
  DuplicateEmailError,
  DuplicateUsernameError,
  LastAdminError,
  NoFieldsError,
} from "@/lib/players/update";
import { OwnerProtectedError } from "@/lib/players/owner-protected-error";
import { resetDb } from "../../helpers/reset-db";
import { createMember, createTestGroup, setupGroupWithAdmin } from "../../helpers/group";

async function membershipOf(groupId: string, playerId: string) {
  return prisma.membership.findUniqueOrThrow({
    where: { groupId_playerId: { groupId, playerId } },
  });
}

describe("updatePlayer", () => {
  beforeEach(resetDb);

  it("updates only the provided fields and writes an audit log with before/after/changedFields", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "U1", email: "u1@x" });

    const updated = await updatePlayer({
      groupId: group.id,
      playerId: target.id,
      actorId: admin.id,
      fields: { name: "New Name", username: "newname" },
    });

    expect(updated.name).toBe("New Name");
    expect(updated.username).toBe("newname");
    expect(updated.email).toBe("u1@x");
    expect(updated.isAdmin).toBe(false);

    const entries = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: "player.update" },
    });
    expect(entries).toHaveLength(1);
    const payload = entries[0].payload as {
      before: Record<string, unknown>;
      after: Record<string, unknown>;
      changedFields: string[];
    };
    expect(payload.changedFields.sort()).toEqual(["name", "username"]);
    expect(payload.before.name).toBe("U1");
    expect(payload.before.username).toBeNull();
    expect(payload.after.name).toBe("New Name");
    expect(payload.after.username).toBe("newname");
  });

  it("throws NoFieldsError when fields is empty", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "U1", email: "u1@x" });
    await expect(
      updatePlayer({ groupId: group.id, playerId: target.id, actorId: admin.id, fields: {} }),
    ).rejects.toBeInstanceOf(NoFieldsError);
  });

  it("throws PlayerNotFoundError for unknown id", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    await expect(
      updatePlayer({
        groupId: group.id,
        playerId: "00000000-0000-0000-0000-000000000000",
        actorId: admin.id,
        fields: { name: "X" },
      }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("throws PlayerNotFoundError for soft-deleted players", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "U1", email: "u1@x" });
    await prisma.player.update({ where: { id: target.id }, data: { deletedAt: new Date() } });
    await expect(
      updatePlayer({
        groupId: group.id,
        playerId: target.id,
        actorId: admin.id,
        fields: { name: "X" },
      }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("throws PlayerNotFoundError for a member of another group", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const other = await createTestGroup("Andere");
    const foreign = await createMember(other.id, { name: "F", email: "f@x" });
    await expect(
      updatePlayer({
        groupId: group.id,
        playerId: foreign.id,
        actorId: admin.id,
        fields: { name: "X" },
      }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
    const fresh = await prisma.player.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(fresh.name).toBe("F");
  });

  it("throws PlayerNotFoundError for a removed member", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "U1", email: "u1@x" });
    await prisma.membership.update({
      where: { groupId_playerId: { groupId: group.id, playerId: target.id } },
      data: { removedAt: new Date() },
    });
    await expect(
      updatePlayer({
        groupId: group.id,
        playerId: target.id,
        actorId: admin.id,
        fields: { name: "X" },
      }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("throws DuplicateUsernameError on P2002 username collision", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    await prisma.player.create({
      data: { name: "A", email: "aa@x", passwordHash: "x", username: "alice" },
    });
    const b = await createMember(group.id, { name: "U2", email: "u2@x" });
    await expect(
      updatePlayer({
        groupId: group.id,
        playerId: b.id,
        actorId: admin.id,
        fields: { username: "alice" },
      }),
    ).rejects.toBeInstanceOf(DuplicateUsernameError);
    const fresh = await prisma.player.findUniqueOrThrow({ where: { id: b.id } });
    expect(fresh.username).toBeNull();
  });

  it("throws DuplicateEmailError on P2002 email collision", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    await prisma.player.create({ data: { name: "A", email: "taken@x", passwordHash: "x" } });
    const b = await createMember(group.id, { name: "U2", email: "u2@x" });
    await expect(
      updatePlayer({
        groupId: group.id,
        playerId: b.id,
        actorId: admin.id,
        fields: { email: "taken@x" },
      }),
    ).rejects.toBeInstanceOf(DuplicateEmailError);
  });

  it("throws LastAdminError when the player holds the only admin/owner role of the group", async () => {
    const { group, admin } = await setupGroupWithAdmin("admin");
    await expect(
      updatePlayer({
        groupId: group.id,
        playerId: admin.id,
        actorId: admin.id,
        fields: { isAdmin: false },
      }),
    ).rejects.toBeInstanceOf(LastAdminError);
    expect((await membershipOf(group.id, admin.id)).role).toBe("admin");
  });

  it("allows demoting the only admin when an owner exists", async () => {
    const { group, admin: owner } = await setupGroupWithAdmin("owner");
    const admin = await createMember(group.id, { name: "A2", email: "a2@x", role: "admin" });
    const updated = await updatePlayer({
      groupId: group.id,
      playerId: admin.id,
      actorId: owner.id,
      fields: { isAdmin: false },
    });
    expect(updated.isAdmin).toBe(false);
    expect((await membershipOf(group.id, admin.id)).role).toBe("member");
    const row = await prisma.player.findUniqueOrThrow({ where: { id: admin.id } });
    expect(row.isAdmin).toBe(false);
  });

  it("does not count an admin of another group as remaining admin", async () => {
    const { group, admin } = await setupGroupWithAdmin("admin");
    const other = await createTestGroup("Andere");
    await createMember(other.id, { name: "Fremd", email: "fremd@x", role: "admin" });
    await expect(
      updatePlayer({
        groupId: group.id,
        playerId: admin.id,
        actorId: admin.id,
        fields: { isAdmin: false },
      }),
    ).rejects.toBeInstanceOf(LastAdminError);
  });

  it("sets the role to admin when promoting", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "U1", email: "u1@x" });
    const updated = await updatePlayer({
      groupId: group.id,
      playerId: target.id,
      actorId: admin.id,
      fields: { isAdmin: true },
    });
    expect(updated.isAdmin).toBe(true);
    expect((await membershipOf(group.id, target.id)).role).toBe("admin");
  });

  it("omits unchanged fields from changedFields", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const target = await createMember(group.id, {
      name: "Same",
      email: "same@x",
      username: "same",
    });
    await updatePlayer({
      groupId: group.id,
      playerId: target.id,
      actorId: admin.id,
      fields: { name: "Same", username: "different" },
    });
    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: target.id, action: "player.update" },
    });
    expect((entry.payload as { changedFields: string[] }).changedFields).toEqual(["username"]);
  });

  it("writes no audit log when all provided fields equal current values", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "Same", email: "same@x" });
    await updatePlayer({
      groupId: group.id,
      playerId: target.id,
      actorId: admin.id,
      fields: { name: "Same" },
    });
    const entries = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: "player.update" },
    });
    expect(entries).toHaveLength(0);
  });

  describe("owner protection", () => {
    it("keeps owner when isAdmin stays true", async () => {
      const { group, admin } = await setupGroupWithAdmin("admin");
      const owner = await createMember(group.id, { name: "O", email: "o@x", role: "owner" });
      await updatePlayer({
        groupId: group.id,
        playerId: owner.id,
        actorId: admin.id,
        fields: { isAdmin: true },
      });
      expect((await membershipOf(group.id, owner.id)).role).toBe("owner");
    });

    it("rejects demoting the owner with OwnerProtectedError", async () => {
      const { group, admin } = await setupGroupWithAdmin("admin");
      const owner = await createMember(group.id, { name: "O", email: "o@x", role: "owner" });
      await expect(
        updatePlayer({
          groupId: group.id,
          playerId: owner.id,
          actorId: admin.id,
          fields: { isAdmin: false },
        }),
      ).rejects.toBeInstanceOf(OwnerProtectedError);
      const p = await prisma.player.findUniqueOrThrow({ where: { id: owner.id } });
      expect(p.isAdmin).toBe(true);
      expect((await membershipOf(group.id, owner.id)).role).toBe("owner");
    });

    it("sole owner gets OwnerProtectedError, not LastAdminError", async () => {
      const { group, admin } = await setupGroupWithAdmin("owner");
      await expect(
        updatePlayer({
          groupId: group.id,
          playerId: admin.id,
          actorId: admin.id,
          fields: { isAdmin: false },
        }),
      ).rejects.toBeInstanceOf(OwnerProtectedError);
    });

    it("rejects changing the owner's email by an admin", async () => {
      const { group, admin } = await setupGroupWithAdmin("admin");
      const owner = await createMember(group.id, { name: "O", email: "o@x", role: "owner" });
      await expect(
        updatePlayer({
          groupId: group.id,
          playerId: owner.id,
          actorId: admin.id,
          fields: { email: "hijack@x" },
        }),
      ).rejects.toBeInstanceOf(OwnerProtectedError);
      const p = await prisma.player.findUniqueOrThrow({ where: { id: owner.id } });
      expect(p.email).toBe("o@x");
    });

    it("allows the owner to change their own email", async () => {
      const { group, admin: owner } = await setupGroupWithAdmin("owner");
      const updated = await updatePlayer({
        groupId: group.id,
        playerId: owner.id,
        actorId: owner.id,
        fields: { email: "new-owner@x" },
      });
      expect(updated.email).toBe("new-owner@x");
    });

    it("admin may still rename the owner", async () => {
      const { group, admin } = await setupGroupWithAdmin("admin");
      const owner = await createMember(group.id, { name: "O", email: "o@x", role: "owner" });
      const updated = await updatePlayer({
        groupId: group.id,
        playerId: owner.id,
        actorId: admin.id,
        fields: { name: "Olga", username: "olga" },
      });
      expect(updated.name).toBe("Olga");
      expect(updated.username).toBe("olga");
      expect(updated.email).toBe("o@x");
    });
  });
});
