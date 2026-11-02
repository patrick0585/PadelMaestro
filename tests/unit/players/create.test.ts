import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/hash";
import { createPlayer } from "@/lib/players/create";
import { resetDb } from "../../helpers/reset-db";
import { createTestGroup, setupGroupWithAdmin } from "../../helpers/group";

describe("createPlayer", () => {
  beforeEach(resetDb);

  async function makeAdmin() {
    const { group, admin } = await setupGroupWithAdmin();
    return { ...admin, groupId: group.id };
  }

  it("creates a player with bcrypt-hashed password", async () => {
    const actor = await makeAdmin();
    const player = await createPlayer({
      email: "new@example.com",
      name: "Newbie",
      password: "hunter22extra",
      isAdmin: false,
      actorId: actor.id,
      groupId: actor.groupId,
    });
    expect(player.email).toBe("new@example.com");
    expect(player.name).toBe("Newbie");
    expect(player.isAdmin).toBe(false);
    const persisted = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    expect(persisted.passwordHash).not.toBe("hunter22extra");
    expect(await verifyPassword("hunter22extra", persisted.passwordHash!)).toBe(true);
  });

  it("writes an audit log without the password", async () => {
    const actor = await makeAdmin();
    await createPlayer({
      email: "new@example.com",
      name: "Newbie",
      password: "hunter22extra",
      isAdmin: true,
      actorId: actor.id,
      groupId: actor.groupId,
    });
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "player.create" },
    });
    expect(log.payload).toMatchObject({ email: "new@example.com", name: "Newbie", isAdmin: true });
    expect(JSON.stringify(log.payload)).not.toContain("hunter22extra");
  });

  it("throws DuplicateEmailError for an existing email", async () => {
    const actor = await makeAdmin();
    await createPlayer({
      email: "dupe@example.com",
      name: "First",
      password: "hunter22extra",
      isAdmin: false,
      actorId: actor.id,
      groupId: actor.groupId,
    });
    await expect(
      createPlayer({
        email: "dupe@example.com",
        name: "Second",
        password: "hunter22extra",
        isAdmin: false,
        actorId: actor.id,
        groupId: actor.groupId,
      }),
    ).rejects.toThrow(/duplicate/i);
  });

  it("creates a membership in the given group, not in another one", async () => {
    const actor = await makeAdmin();
    const other = await createTestGroup("Andere");
    const a = await createPlayer({
      email: "a@example.com", name: "A", password: "hunter22extra", isAdmin: true,
      actorId: actor.id, groupId: actor.groupId,
    });
    const m = await createPlayer({
      email: "m@example.com", name: "M", password: "hunter22extra", isAdmin: false,
      actorId: actor.id, groupId: actor.groupId,
    });
    const rows = await prisma.membership.findMany({ where: { playerId: { in: [a.id, m.id] } } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.groupId === actor.groupId && r.removedAt === null)).toBe(true);
    expect(rows.some((r) => r.groupId === other.id)).toBe(false);
    expect(rows.find((r) => r.playerId === a.id)!.role).toBe("admin");
    expect(rows.find((r) => r.playerId === m.id)!.role).toBe("member");
  });
});
