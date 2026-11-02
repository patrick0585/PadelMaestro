import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth/hash";
import { resetPlayerPassword, PlayerNotFoundError } from "@/lib/players/reset-password";
import { OwnerProtectedError } from "@/lib/players/owner-protected-error";
import { resetDb } from "../../helpers/reset-db";
import { createMember, createTestGroup, setupGroupWithAdmin } from "../../helpers/group";

describe("resetPlayerPassword", () => {
  beforeEach(resetDb);

  async function setup() {
    const { group, admin } = await setupGroupWithAdmin();
    const target = await createMember(group.id, {
      name: "Target",
      email: "t@example.com",
      passwordHash: await hashPassword("oldpass12"),
    });
    return { group, actor: admin, target };
  }

  it("hashes and stores the new password", async () => {
    const { group, actor, target } = await setup();
    await resetPlayerPassword({
      groupId: group.id,
      playerId: target.id,
      password: "newpass12",
      actorId: actor.id,
    });
    const updated = await prisma.player.findUniqueOrThrow({ where: { id: target.id } });
    expect(await verifyPassword("newpass12", updated.passwordHash!)).toBe(true);
    expect(await verifyPassword("oldpass12", updated.passwordHash!)).toBe(false);
  });

  it("writes an audit log without the password", async () => {
    const { group, actor, target } = await setup();
    await resetPlayerPassword({
      groupId: group.id,
      playerId: target.id,
      password: "newpass12",
      actorId: actor.id,
    });
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "player.password_reset" },
    });
    expect(log.payload).toMatchObject({ playerId: target.id });
    expect(JSON.stringify(log.payload)).not.toContain("newpass12");
  });

  it("throws PlayerNotFoundError for an unknown id", async () => {
    const { group, actor } = await setup();
    await expect(
      resetPlayerPassword({
        groupId: group.id,
        playerId: "00000000-0000-0000-0000-000000000000",
        password: "whatever12",
        actorId: actor.id,
      }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("throws PlayerNotFoundError for a member of another group", async () => {
    const { group, actor } = await setup();
    const other = await createTestGroup("Andere");
    const foreign = await createMember(other.id, {
      name: "Foreign",
      email: "f@example.com",
      passwordHash: "legacy",
    });
    await expect(
      resetPlayerPassword({
        groupId: group.id,
        playerId: foreign.id,
        password: "newpass12",
        actorId: actor.id,
      }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
    const after = await prisma.player.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(after.passwordHash).toBe("legacy");
  });

  it("throws PlayerNotFoundError for a removed member", async () => {
    const { group, actor, target } = await setup();
    await prisma.membership.updateMany({
      where: { groupId: group.id, playerId: target.id },
      data: { removedAt: new Date() },
    });
    await expect(
      resetPlayerPassword({
        groupId: group.id,
        playerId: target.id,
        password: "newpass12",
        actorId: actor.id,
      }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });
  it("rejects resetting the owner's password by an admin with OwnerProtectedError", async () => {
    const { group, admin } = await setupGroupWithAdmin("admin");
    const owner = await createMember(group.id, {
      name: "Owner",
      email: "o@example.com",
      role: "owner",
      passwordHash: "legacy",
    });
    await expect(
      resetPlayerPassword({
        groupId: group.id,
        playerId: owner.id,
        password: "newpass12",
        actorId: admin.id,
      }),
    ).rejects.toBeInstanceOf(OwnerProtectedError);
    const after = await prisma.player.findUniqueOrThrow({ where: { id: owner.id } });
    expect(after.passwordHash).toBe("legacy");
  });

  it("allows the owner to reset their own password", async () => {
    const { group, admin: owner } = await setupGroupWithAdmin("owner");
    await resetPlayerPassword({
      groupId: group.id,
      playerId: owner.id,
      password: "newpass12",
      actorId: owner.id,
    });
    const after = await prisma.player.findUniqueOrThrow({ where: { id: owner.id } });
    expect(await verifyPassword("newpass12", after.passwordHash!)).toBe(true);
  });
});
