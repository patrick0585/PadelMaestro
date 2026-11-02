import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/hash";
import { PATCH } from "@/app/api/players/[id]/password/route";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup, sessionFor, setupGroupWithAdmin } from "../helpers/group";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

function patchReq(id: string, password: string) {
  return new Request(`http://localhost/api/players/${id}/password`, {
    method: "PATCH",
    body: JSON.stringify({ password }),
    headers: { "content-type": "application/json" },
  });
}

describe("PATCH /api/players/[id]/password", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("resets the password and returns 204", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const target = await createMember(group.id, {
      name: "Target",
      email: "t@example.com",
      passwordHash: "legacy",
    });
    authMock.mockResolvedValue(session);
    const res = await PATCH(patchReq(target.id, "newpass12"), {
      params: Promise.resolve({ id: target.id }),
    });
    expect(res.status).toBe(204);
    const updated = await prisma.player.findUniqueOrThrow({ where: { id: target.id } });
    expect(await verifyPassword("newpass12", updated.passwordHash!)).toBe(true);
  });

  it("returns 404 for unknown id", async () => {
    const { session } = await setupGroupWithAdmin();
    authMock.mockResolvedValue(session);
    const id = "00000000-0000-0000-0000-000000000000";
    const res = await PATCH(patchReq(id, "newpass12"), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 for a player of another group", async () => {
    const { session } = await setupGroupWithAdmin();
    const other = await createTestGroup("Andere");
    const foreign = await createMember(other.id, {
      name: "Foreign",
      email: "f@example.com",
      passwordHash: "legacy",
    });
    authMock.mockResolvedValue(session);
    const res = await PATCH(patchReq(foreign.id, "newpass12"), {
      params: Promise.resolve({ id: foreign.id }),
    });
    expect(res.status).toBe(404);
    const after = await prisma.player.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(after.passwordHash).toBe("legacy");
  });

  it("returns 401 without session", async () => {
    authMock.mockResolvedValue(null);
    const id = "00000000-0000-0000-0000-000000000000";
    const res = await PATCH(patchReq(id, "newpass12"), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for member role", async () => {
    const { group } = await setupGroupWithAdmin();
    const u = await createMember(group.id, {
      name: "U",
      email: "u@example.com",
      passwordHash: "x",
    });
    authMock.mockResolvedValue(sessionFor(u, group.id, "member"));
    const res = await PATCH(patchReq(u.id, "newpass12"), { params: Promise.resolve({ id: u.id }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 for short password", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const target = await createMember(group.id, {
      name: "T",
      email: "t2@example.com",
      passwordHash: "x",
    });
    authMock.mockResolvedValue(session);
    const res = await PATCH(patchReq(target.id, "short"), {
      params: Promise.resolve({ id: target.id }),
    });
    expect(res.status).toBe(400);
  });
  it("returns 409 owner_protected when an admin resets the owner's password", async () => {
    const { group, session } = await setupGroupWithAdmin("admin");
    const owner = await createMember(group.id, {
      name: "Owner",
      email: "owner@example.com",
      role: "owner",
      passwordHash: "legacy",
    });
    authMock.mockResolvedValue(session);
    const res = await PATCH(patchReq(owner.id, "newpass12"), {
      params: Promise.resolve({ id: owner.id }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "owner_protected" });
    const after = await prisma.player.findUniqueOrThrow({ where: { id: owner.id } });
    expect(after.passwordHash).toBe("legacy");
  });

  it("returns 404 for a removed member of the group", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const gone = await createMember(group.id, {
      name: "Gone",
      email: "gone@example.com",
      passwordHash: "legacy",
    });
    await prisma.membership.updateMany({
      where: { groupId: group.id, playerId: gone.id },
      data: { removedAt: new Date() },
    });
    authMock.mockResolvedValue(session);
    const res = await PATCH(patchReq(gone.id, "newpass12"), {
      params: Promise.resolve({ id: gone.id }),
    });
    expect(res.status).toBe(404);
    const after = await prisma.player.findUniqueOrThrow({ where: { id: gone.id } });
    expect(after.passwordHash).toBe("legacy");
  });
});
