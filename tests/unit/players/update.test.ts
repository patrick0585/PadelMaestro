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
import { resetDb } from "../../helpers/reset-db";

async function makeAdmin(i = 1) {
  return prisma.player.create({
    data: {
      name: `Admin${i}`,
      email: `a${i}@x`,
      passwordHash: "x",
      isAdmin: true,
    },
  });
}
async function makeUser(i = 1) {
  return prisma.player.create({
    data: { name: `U${i}`, email: `u${i}@x`, passwordHash: "x" },
  });
}

describe("updatePlayer", () => {
  beforeEach(resetDb);

  it("updates only the provided fields and writes an audit log with before/after/changedFields", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();

    const updated = await updatePlayer({
      playerId: target.id,
      actorId: admin.id,
      fields: { name: "New Name", username: "newname" },
    });

    expect(updated.name).toBe("New Name");
    expect(updated.username).toBe("newname");
    expect(updated.email).toBe("u1@x"); // unchanged
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
    const admin = await makeAdmin();
    const target = await makeUser();
    await expect(
      updatePlayer({ playerId: target.id, actorId: admin.id, fields: {} }),
    ).rejects.toBeInstanceOf(NoFieldsError);
  });

  it("throws PlayerNotFoundError for unknown id", async () => {
    const admin = await makeAdmin();
    await expect(
      updatePlayer({
        playerId: "00000000-0000-0000-0000-000000000000",
        actorId: admin.id,
        fields: { name: "X" },
      }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("throws PlayerNotFoundError for soft-deleted players", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    await prisma.player.update({
      where: { id: target.id },
      data: { deletedAt: new Date() },
    });
    await expect(
      updatePlayer({ playerId: target.id, actorId: admin.id, fields: { name: "X" } }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("throws DuplicateUsernameError on P2002 username collision", async () => {
    const admin = await makeAdmin();
    const a = await prisma.player.create({
      data: { name: "A", email: "aa@x", passwordHash: "x", username: "alice" },
    });
    const b = await makeUser(2);
    await expect(
      updatePlayer({ playerId: b.id, actorId: admin.id, fields: { username: "alice" } }),
    ).rejects.toBeInstanceOf(DuplicateUsernameError);
    const fresh = await prisma.player.findUniqueOrThrow({ where: { id: b.id } });
    expect(fresh.username).toBeNull();
    void a;
  });

  it("throws DuplicateEmailError on P2002 email collision", async () => {
    const admin = await makeAdmin();
    const a = await prisma.player.create({
      data: { name: "A", email: "taken@x", passwordHash: "x" },
    });
    const b = await makeUser(2);
    await expect(
      updatePlayer({ playerId: b.id, actorId: admin.id, fields: { email: "taken@x" } }),
    ).rejects.toBeInstanceOf(DuplicateEmailError);
    void a;
  });

  it("throws LastAdminError when demoting the only remaining admin", async () => {
    const onlyAdmin = await makeAdmin();
    await expect(
      updatePlayer({
        playerId: onlyAdmin.id,
        actorId: onlyAdmin.id,
        fields: { isAdmin: false },
      }),
    ).rejects.toBeInstanceOf(LastAdminError);
  });

  it("allows demoting an admin when another admin exists", async () => {
    const a1 = await makeAdmin(1);
    const a2 = await makeAdmin(2);
    const updated = await updatePlayer({
      playerId: a2.id,
      actorId: a1.id,
      fields: { isAdmin: false },
    });
    expect(updated.isAdmin).toBe(false);
  });

  it("promotes a non-admin even when only one admin exists (no guard)", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    const updated = await updatePlayer({
      playerId: target.id,
      actorId: admin.id,
      fields: { isAdmin: true },
    });
    expect(updated.isAdmin).toBe(true);
  });

  it("omits unchanged fields from changedFields", async () => {
    const admin = await makeAdmin();
    const target = await prisma.player.create({
      data: { name: "Same", email: "same@x", passwordHash: "x", username: "same" },
    });
    await updatePlayer({
      playerId: target.id,
      actorId: admin.id,
      fields: { name: "Same", username: "different" },
    });
    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: target.id, action: "player.update" },
    });
    expect((entry.payload as { changedFields: string[] }).changedFields).toEqual([
      "username",
    ]);
  });
});
