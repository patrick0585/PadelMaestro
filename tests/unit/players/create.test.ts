import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/hash";
import { createPlayer } from "@/lib/players/create";
import { resetDb } from "../../helpers/reset-db";

describe("createPlayer", () => {
  beforeEach(resetDb);

  async function makeAdmin() {
    return prisma.player.create({
      data: { name: "Admin", email: "admin@example.com", isAdmin: true, passwordHash: "x" },
    });
  }

  it("creates a player with bcrypt-hashed password", async () => {
    const actor = await makeAdmin();
    const player = await createPlayer({
      email: "new@example.com",
      name: "Newbie",
      password: "hunter22extra",
      isAdmin: false,
      actorId: actor.id,
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
    });
    await expect(
      createPlayer({
        email: "dupe@example.com",
        name: "Second",
        password: "hunter22extra",
        isAdmin: false,
        actorId: actor.id,
      }),
    ).rejects.toThrow(/duplicate/i);
  });

  it("creates a membership in the sole group with role admin/member", async () => {
    const actor = await makeAdmin();
    const a = await createPlayer({
      email: "a@example.com", name: "A", password: "hunter22extra", isAdmin: true, actorId: actor.id,
    });
    const m = await createPlayer({
      email: "m@example.com", name: "M", password: "hunter22extra", isAdmin: false, actorId: actor.id,
    });
    const groups = await prisma.group.findMany();
    expect(groups).toHaveLength(1);
    const rows = await prisma.membership.findMany({ where: { playerId: { in: [a.id, m.id] } } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.groupId === groups[0].id && r.removedAt === null)).toBe(true);
    expect(rows.find((r) => r.playerId === a.id)!.role).toBe("admin");
    expect(rows.find((r) => r.playerId === m.id)!.role).toBe("member");
  });
});
