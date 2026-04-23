import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import {
  changeOwnPassword,
  WrongCurrentPasswordError,
  PlayerNotFoundError,
} from "@/lib/players/change-password";
import { hashPassword, verifyPassword } from "@/lib/auth/hash";

async function makePlayer(name: string, password: string) {
  const passwordHash = await hashPassword(password);
  return prisma.player.create({
    data: { name, email: `${name.toLowerCase()}@x`, passwordHash },
  });
}

describe("changeOwnPassword", () => {
  beforeEach(resetDb);

  it("updates the passwordHash when the current password matches", async () => {
    const me = await makePlayer("Me", "oldpass12");
    await changeOwnPassword({
      playerId: me.id,
      currentPassword: "oldpass12",
      newPassword: "newpass12",
    });
    const updated = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(await verifyPassword("newpass12", updated.passwordHash!)).toBe(true);
    expect(await verifyPassword("oldpass12", updated.passwordHash!)).toBe(false);
  });

  it("throws WrongCurrentPasswordError when the current password is wrong", async () => {
    const me = await makePlayer("Me", "oldpass12");
    await expect(
      changeOwnPassword({
        playerId: me.id,
        currentPassword: "WRONG",
        newPassword: "newpass12",
      }),
    ).rejects.toBeInstanceOf(WrongCurrentPasswordError);
    // Hash is unchanged.
    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(await verifyPassword("oldpass12", stored.passwordHash!)).toBe(true);
  });

  it("throws PlayerNotFoundError when the player is soft-deleted", async () => {
    const me = await makePlayer("Me", "oldpass12");
    await prisma.player.update({ where: { id: me.id }, data: { deletedAt: new Date() } });
    await expect(
      changeOwnPassword({
        playerId: me.id,
        currentPassword: "oldpass12",
        newPassword: "newpass12",
      }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("throws PlayerNotFoundError when the player has no password set", async () => {
    const me = await prisma.player.create({
      data: { name: "NoPass", email: "nopass@x", passwordHash: null },
    });
    await expect(
      changeOwnPassword({
        playerId: me.id,
        currentPassword: "anything",
        newPassword: "newpass12",
      }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("writes a player.password_change audit log entry on success", async () => {
    const me = await makePlayer("Me", "oldpass12");
    await changeOwnPassword({
      playerId: me.id,
      currentPassword: "oldpass12",
      newPassword: "newpass12",
    });
    const logs = await prisma.auditLog.findMany({
      where: { entityId: me.id, action: "player.password_change" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(me.id);
    expect(logs[0].entityType).toBe("Player");
  });
});
