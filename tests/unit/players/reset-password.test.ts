import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth/hash";
import { resetPlayerPassword, PlayerNotFoundError } from "@/lib/players/reset-password";
import { resetDb } from "../../helpers/reset-db";

describe("resetPlayerPassword", () => {
  beforeEach(resetDb);

  async function setup() {
    const actor = await prisma.player.create({
      data: { name: "Admin", email: "admin@example.com", isAdmin: true, passwordHash: "x" },
    });
    const target = await prisma.player.create({
      data: {
        name: "Target",
        email: "t@example.com",
        passwordHash: await hashPassword("oldpass12"),
      },
    });
    return { actor, target };
  }

  it("hashes and stores the new password", async () => {
    const { actor, target } = await setup();
    await resetPlayerPassword({ playerId: target.id, password: "newpass12", actorId: actor.id });
    const updated = await prisma.player.findUniqueOrThrow({ where: { id: target.id } });
    expect(await verifyPassword("newpass12", updated.passwordHash!)).toBe(true);
    expect(await verifyPassword("oldpass12", updated.passwordHash!)).toBe(false);
  });

  it("writes an audit log without the password", async () => {
    const { actor, target } = await setup();
    await resetPlayerPassword({ playerId: target.id, password: "newpass12", actorId: actor.id });
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "player.password_reset" },
    });
    expect(log.payload).toMatchObject({ playerId: target.id });
    expect(JSON.stringify(log.payload)).not.toContain("newpass12");
  });

  it("throws PlayerNotFoundError for an unknown id", async () => {
    const { actor } = await setup();
    await expect(
      resetPlayerPassword({
        playerId: "00000000-0000-0000-0000-000000000000",
        password: "whatever12",
        actorId: actor.id,
      }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });
});
