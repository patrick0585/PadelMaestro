import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { PATCH, DELETE } from "@/app/api/players/[id]/route";
import { POST as joinPOST } from "@/app/api/game-days/[id]/join/route";
import { updatePlayer } from "@/lib/players/update";
import { authorizeCredentials } from "@/lib/auth/authorize";
import { hashPassword } from "@/lib/auth/hash";
import { resetDb } from "../helpers/reset-db";
import {
  createMember,
  createTestGameDay,
  createTestGroup,
  createTestSeason,
  sessionFor,
  setupGroupWithAdmin,
} from "../helpers/group";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

function patchRequest(id: string, body: unknown) {
  return new Request(`http://localhost/api/players/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function call(id: string, body: unknown) {
  return PATCH(patchRequest(id, body), { params: Promise.resolve({ id }) });
}

async function callDelete(id: string) {
  return DELETE(new Request(`http://localhost/api/players/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

describe("PATCH /api/players/[id]", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("updates fields and returns the patched player", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "U1", email: "user1@example.com" });
    authMock.mockResolvedValue(session);
    const res = await call(target.id, { name: "Renamed", username: "renamed" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { username: string; name: string };
    expect(body.name).toBe("Renamed");
    expect(body.username).toBe("renamed");
    const entries = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: "player.update" },
    });
    expect(entries).toHaveLength(1);
  });

  it("normalises username to lowercase", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "U1", email: "user1@example.com" });
    authMock.mockResolvedValue(session);
    const res = await call(target.id, { username: "AliceSmith" });
    expect(res.status).toBe(200);
    const row = await prisma.player.findUniqueOrThrow({ where: { id: target.id } });
    expect(row.username).toBe("alicesmith");
  });

  it("returns 400 for an empty body", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "U1", email: "user1@example.com" });
    authMock.mockResolvedValue(session);
    const res = await call(target.id, {});
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("no_fields");
  });

  it("returns 400 for an invalid username regex", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "U1", email: "user1@example.com" });
    authMock.mockResolvedValue(session);
    const res = await call(target.id, { username: "AB" });
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin", async () => {
    const { group } = await setupGroupWithAdmin();
    const u = await createMember(group.id, { name: "U1", email: "user1@example.com" });
    authMock.mockResolvedValue(sessionFor(u, group.id, "member"));
    const res = await call(u.id, { name: "X" });
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown player", async () => {
    const { session } = await setupGroupWithAdmin();
    authMock.mockResolvedValue(session);
    const res = await call("00000000-0000-0000-0000-000000000000", { name: "X" });
    expect(res.status).toBe(404);
  });

  it("returns 404 for a player of another group", async () => {
    const { session } = await setupGroupWithAdmin();
    const other = await createTestGroup("Andere");
    const foreign = await createMember(other.id, { name: "F", email: "f@example.com" });
    authMock.mockResolvedValue(session);
    const res = await call(foreign.id, { name: "X" });
    expect(res.status).toBe(404);
    const row = await prisma.player.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(row.name).toBe("F");
  });

  it("returns 409 username_taken on collision", async () => {
    const { group, session } = await setupGroupWithAdmin();
    await prisma.player.create({
      data: {
        name: "Taken",
        email: "taken-user@example.com",
        passwordHash: "x",
        username: "alice",
      },
    });
    const target = await createMember(group.id, { name: "U2", email: "user2@example.com" });
    authMock.mockResolvedValue(session);
    const res = await call(target.id, { username: "alice" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("username_taken");
  });

  it("admin email change resets emailVerifiedAt and pendingEmail and stores lowercase", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const target = await createMember(group.id, {
      name: "U1",
      email: "user1@example.com",
      emailVerifiedAt: new Date(),
    });
    await prisma.player.update({ where: { id: target.id }, data: { pendingEmail: "pending@example.com" } });
    authMock.mockResolvedValue(session);
    const res = await call(target.id, { email: "New.Mail@Example.com" });
    expect(res.status).toBe(200);
    const p = await prisma.player.findUniqueOrThrow({ where: { id: target.id } });
    expect(p.email).toBe("new.mail@example.com");
    expect(p.emailVerifiedAt).toBeNull();
    expect(p.pendingEmail).toBeNull();
  });

  it("admin email change with only different casing is a no-op (no audit row)", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const verifiedAt = new Date();
    const target = await createMember(group.id, {
      name: "U1",
      email: "user1@example.com",
      emailVerifiedAt: verifiedAt,
    });
    authMock.mockResolvedValue(session);
    const res = await call(target.id, { email: "User1@Example.com" });
    expect(res.status).toBe(200);
    const p = await prisma.player.findUniqueOrThrow({ where: { id: target.id } });
    expect(p.email).toBe("user1@example.com");
    expect(p.emailVerifiedAt?.getTime()).toBe(verifiedAt.getTime());
    const entries = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: "player.update" },
    });
    expect(entries).toHaveLength(0);
  });

  it("returns 409 email_taken on collision", async () => {
    const { group, session } = await setupGroupWithAdmin();
    await prisma.player.create({
      data: { name: "Taken", email: "taken@example.com", passwordHash: "x" },
    });
    const target = await createMember(group.id, { name: "U2", email: "user2@example.com" });
    authMock.mockResolvedValue(session);
    const res = await call(target.id, { email: "taken@example.com" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("email_taken");
  });

  it("returns 409 last_admin when demoting the only admin", async () => {
    const { admin, session } = await setupGroupWithAdmin("admin");
    authMock.mockResolvedValue(session);
    const res = await call(admin.id, { isAdmin: false });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("last_admin");
  });

  it("returns 409 owner_protected when demoting the owner", async () => {
    const { group, session } = await setupGroupWithAdmin("admin");
    const owner = await createMember(group.id, { name: "O", email: "owner@example.com", role: "owner" });
    authMock.mockResolvedValue(session);
    const res = await call(owner.id, { isAdmin: false });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("owner_protected");
    const m = await prisma.membership.findFirstOrThrow({ where: { playerId: owner.id } });
    expect(m.role).toBe("owner");
  });

  it("returns 409 owner_protected, not last_admin, for the sole owner", async () => {
    const { admin, session } = await setupGroupWithAdmin("owner");
    authMock.mockResolvedValue(session);
    const res = await call(admin.id, { isAdmin: false });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("owner_protected");
  });

  it("returns 409 owner_protected when an admin changes the owner's email", async () => {
    const { group, session } = await setupGroupWithAdmin("admin");
    const owner = await createMember(group.id, { name: "O", email: "owner@example.com", role: "owner" });
    authMock.mockResolvedValue(session);
    const res = await call(owner.id, { email: "hijack@example.com" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("owner_protected");
    const p = await prisma.player.findUniqueOrThrow({ where: { id: owner.id } });
    expect(p.email).toBe("owner@example.com");
  });

  it("returns 200 and demotes an admin to member when an owner exists", async () => {
    const { group, session } = await setupGroupWithAdmin("owner");
    const admin = await createMember(group.id, { name: "A2", email: "a2@example.com", role: "admin" });
    authMock.mockResolvedValue(session);
    const res = await call(admin.id, { isAdmin: false });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { isAdmin: boolean }).isAdmin).toBe(false);
    const m = await prisma.membership.findFirstOrThrow({ where: { playerId: admin.id } });
    expect(m.role).toBe("member");
  });

  it("PATCH role member on the owner → 409 owner_protected; on the last admin → 409 last_admin", async () => {
    const { group, session } = await setupGroupWithAdmin("admin");
    const owner = await createMember(group.id, { name: "O", email: "owner@example.com", role: "owner" });
    authMock.mockResolvedValue(session);
    const ownerRes = await call(owner.id, { role: "member" });
    expect(ownerRes.status).toBe(409);
    expect(((await ownerRes.json()) as { error: string }).error).toBe("owner_protected");
    const m = await prisma.membership.findFirstOrThrow({ where: { playerId: owner.id } });
    expect(m.role).toBe("owner");

    await prisma.membership.delete({ where: { id: m.id } });
    const adminId = session.user.id;
    const adminRes = await call(adminId, { role: "member" });
    expect(adminRes.status).toBe(409);
    expect(((await adminRes.json()) as { error: string }).error).toBe("last_admin");
    const am = await prisma.membership.findFirstOrThrow({ where: { playerId: adminId } });
    expect(am.role).toBe("admin");
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null);
    const res = await call("00000000-0000-0000-0000-000000000000", { name: "X" });
    expect(res.status).toBe(401);
  });
});

describe("updatePlayer role", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("updatePlayer with role admin promotes, with role member demotes, and role wins over isAdmin", async () => {
    const { group, admin } = await setupGroupWithAdmin("owner");
    const target = await createMember(group.id, { name: "T", email: "t@example.com" });
    const roleOf = async () =>
      (await prisma.membership.findFirstOrThrow({ where: { playerId: target.id } })).role;
    const run = (fields: Parameters<typeof updatePlayer>[0]["fields"]) =>
      updatePlayer({ groupId: group.id, playerId: target.id, actorId: admin.id, fields });

    expect((await run({ role: "admin" })).isAdmin).toBe(true);
    expect(await roleOf()).toBe("admin");

    expect((await run({ role: "member" })).isAdmin).toBe(false);
    expect(await roleOf()).toBe("member");

    await run({ role: "admin", isAdmin: false });
    expect(await roleOf()).toBe("admin");
    await run({ role: "member", isAdmin: true });
    expect(await roleOf()).toBe("member");

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: target.id, action: "player.update" },
      orderBy: { createdAt: "asc" },
    });
    const payload = entry.payload as {
      before: { role: string };
      after: { role: string };
      changedFields: string[];
    };
    expect(payload.before.role).toBe("member");
    expect(payload.after.role).toBe("admin");
    expect(payload.changedFields).toEqual(["isAdmin"]);
  });
});

describe("DELETE /api/players/[id]", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null);
    const res = await callDelete("00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(401);
  });

  it("returns 204 and ends the membership", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "U1", email: "user1@example.com" });
    authMock.mockResolvedValue(session);
    const res = await callDelete(target.id);
    expect(res.status).toBe(204);
    const m = await prisma.membership.findFirstOrThrow({ where: { playerId: target.id } });
    expect(m.removedAt).not.toBeNull();
  });

  it("keeps the account: the removed player can still log in without a group", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const target = await createMember(group.id, {
      name: "U1",
      email: "user1@example.com",
      passwordHash: await hashPassword("pw12345678"),
    });
    authMock.mockResolvedValue(session);
    expect((await callDelete(target.id)).status).toBe(204);
    const p = await prisma.player.findUniqueOrThrow({ where: { id: target.id } });
    expect(p.deletedAt).toBeNull();
    const user = await authorizeCredentials({
      identifier: "user1@example.com",
      password: "pw12345678",
    });
    expect(user?.id).toBe(target.id);
    expect(user?.groupId).toBeNull();
    expect(user?.isAdmin).toBe(false);
  });

  it("locks the removed player out of the group's APIs", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const season = await createTestSeason(group.id);
    const day = await createTestGameDay(group.id, season.id);
    const target = await createMember(group.id, { name: "U1", email: "user1@example.com" });
    authMock.mockResolvedValue(session);
    expect((await callDelete(target.id)).status).toBe(204);

    authMock.mockResolvedValue(sessionFor(target, null, null));
    const res = await joinPOST(
      new Request(`http://localhost/api/game-days/${day.id}/join`, { method: "POST" }),
      { params: Promise.resolve({ id: day.id }) },
    );
    expect(res.status).toBe(403);
    const joined = await prisma.gameDayParticipant.findUnique({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: target.id } },
    });
    expect(joined).toBeNull();
  });

  it("returns 404 for a player of another group", async () => {
    const { session } = await setupGroupWithAdmin();
    const other = await createTestGroup("Andere");
    const foreign = await createMember(other.id, { name: "F", email: "f@example.com" });
    authMock.mockResolvedValue(session);
    const res = await callDelete(foreign.id);
    expect(res.status).toBe(404);
    const p = await prisma.player.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(p.deletedAt).toBeNull();
    const m = await prisma.membership.findFirstOrThrow({ where: { playerId: foreign.id } });
    expect(m.removedAt).toBeNull();
  });

  it("returns 409 owner_protected when deleting the owner", async () => {
    const { group, session } = await setupGroupWithAdmin("admin");
    const owner = await createMember(group.id, { name: "O", email: "owner@example.com", role: "owner" });
    authMock.mockResolvedValue(session);
    const res = await callDelete(owner.id);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("owner_protected");
    const p = await prisma.player.findUniqueOrThrow({ where: { id: owner.id } });
    expect(p.deletedAt).toBeNull();
    const m = await prisma.membership.findFirstOrThrow({ where: { playerId: owner.id } });
    expect(m.removedAt).toBeNull();
  });

  it("returns 403 for a member session", async () => {
    const { group } = await setupGroupWithAdmin();
    const u = await createMember(group.id, { name: "U1", email: "user1@example.com" });
    const target = await createMember(group.id, { name: "U2", email: "user2@example.com" });
    authMock.mockResolvedValue(sessionFor(u, group.id, "member"));
    const res = await callDelete(target.id);
    expect(res.status).toBe(403);
    const m = await prisma.membership.findFirstOrThrow({ where: { playerId: target.id } });
    expect(m.removedAt).toBeNull();
  });
});

describe("PATCH /api/players/[id] on a shared account", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  async function ownerOfBInA(groupAId: string) {
    const groupB = await createTestGroup("Gruppe B");
    const ownerB = await createMember(groupB.id, {
      name: "Bea",
      email: "bea@example.com",
      role: "owner",
      passwordHash: "x",
    });
    await prisma.membership.create({ data: { groupId: groupAId, playerId: ownerB.id } });
    return ownerB;
  }

  it("returns 409 account_shared for email, name or username changes", async () => {
    const { group, session } = await setupGroupWithAdmin("admin");
    const ownerB = await ownerOfBInA(group.id);
    authMock.mockResolvedValue(session);
    for (const body of [{ email: "hijack@example.com" }, { name: "Gekapert" }, { username: "gekapert" }]) {
      const res = await call(ownerB.id, body);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "account_shared" });
    }
    const p = await prisma.player.findUniqueOrThrow({ where: { id: ownerB.id } });
    expect(p).toMatchObject({ email: "bea@example.com", name: "Bea", username: null });
  });

  it("still allows a role change", async () => {
    const { group, session } = await setupGroupWithAdmin("admin");
    const ownerB = await ownerOfBInA(group.id);
    authMock.mockResolvedValue(session);
    const res = await call(ownerB.id, { role: "admin" });
    expect(res.status).toBe(200);
    const m = await prisma.membership.findFirstOrThrow({
      where: { groupId: group.id, playerId: ownerB.id },
    });
    expect(m.role).toBe("admin");
  });
});
