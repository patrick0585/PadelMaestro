import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { PATCH, DELETE } from "@/app/api/players/[id]/route";
import { resetDb } from "../helpers/reset-db";
import {
  createMember,
  createTestGroup,
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
    const p = await prisma.player.findUniqueOrThrow({ where: { id: owner.id } });
    expect(p.isAdmin).toBe(true);
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

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null);
    const res = await call("00000000-0000-0000-0000-000000000000", { name: "X" });
    expect(res.status).toBe(401);
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
