import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import {
  changeOwnPassword,
  WrongCurrentPasswordError,
  PlayerNotFoundError,
} from "@/lib/players/change-password";
import { hashPassword, verifyPassword } from "@/lib/auth/hash";

// vi.mock is hoisted to file scope; it's inert for the service `describe`
// block because those tests never touch `auth()`, but be aware if adding
// tests that call session-gated helpers from the service module.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { POST } from "@/app/api/profile/password/route";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

function jsonRequest(body: unknown): Request {
  return new Request("http://test/api/profile/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

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

  it("does not write an audit log entry on wrong-password failure", async () => {
    const me = await makePlayer("Me", "oldpass12");
    await expect(
      changeOwnPassword({
        playerId: me.id,
        currentPassword: "WRONG",
        newPassword: "newpass12",
      }),
    ).rejects.toBeInstanceOf(WrongCurrentPasswordError);
    const logs = await prisma.auditLog.findMany({
      where: { entityId: me.id, action: "player.password_change" },
    });
    expect(logs).toHaveLength(0);
  });
});

describe("POST /api/profile/password", () => {
  beforeEach(resetDb);

  it("returns 401 when not logged in", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POST(jsonRequest({ currentPassword: "x", newPassword: "newpass12" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on schema violation (short newPassword)", async () => {
    const me = await makePlayer("Me", "oldpass12");
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const res = await POST(jsonRequest({ currentPassword: "oldpass12", newPassword: "short" }));
    expect(res.status).toBe(400);
    const unchanged = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(await verifyPassword("oldpass12", unchanged.passwordHash!)).toBe(true);
  });

  it("returns 401 when current password is wrong", async () => {
    const me = await makePlayer("Me", "oldpass12");
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const res = await POST(jsonRequest({ currentPassword: "WRONG", newPassword: "newpass12" }));
    expect(res.status).toBe(401);
  });

  it("returns 204 on success and updates the hash", async () => {
    const me = await makePlayer("Me", "oldpass12");
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const res = await POST(jsonRequest({ currentPassword: "oldpass12", newPassword: "newpass12" }));
    expect(res.status).toBe(204);
    const updated = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(await verifyPassword("newpass12", updated.passwordHash!)).toBe(true);
  });

  it("returns 400 when newPassword exceeds 72 bytes and leaves the hash unchanged", async () => {
    const me = await makePlayer("Me", "oldpass12");
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const res = await POST(
      jsonRequest({ currentPassword: "oldpass12", newPassword: "x".repeat(73) }),
    );
    expect(res.status).toBe(400);
    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(await verifyPassword("oldpass12", stored.passwordHash!)).toBe(true);
  });

  it("returns 400 when currentPassword exceeds 72 bytes", async () => {
    const me = await makePlayer("Me", "oldpass12");
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const res = await POST(
      jsonRequest({ currentPassword: "x".repeat(73), newPassword: "newpass12" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the authenticated player has been soft-deleted", async () => {
    const me = await makePlayer("Me", "oldpass12");
    await prisma.player.update({ where: { id: me.id }, data: { deletedAt: new Date() } });
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const res = await POST(
      jsonRequest({ currentPassword: "oldpass12", newPassword: "newpass12" }),
    );
    expect(res.status).toBe(404);
  });
});
