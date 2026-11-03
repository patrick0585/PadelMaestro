import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup, sessionFor, setupGroupWithAdmin } from "../helpers/group";
import { createInvitation } from "@/lib/invitations/create";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { GET, POST } from "@/app/api/invitations/route";
import { DELETE } from "@/app/api/invitations/[id]/route";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

const post = (body?: unknown) =>
  POST(
    new Request("http://test/api/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
const del = (id: string) =>
  DELETE(new Request(`http://test/api/invitations/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
});

describe("GET /api/invitations", () => {
  it("403 for member, 200 list for admin with only this group's open links", async () => {
    const { group, admin, session } = await setupGroupWithAdmin();
    const member = await createMember(group.id, { name: "M", email: "m@example.com" });
    const other = await createTestGroup("Andere");
    const otherAdmin = await createMember(other.id, {
      name: "O",
      email: "o@example.com",
      role: "owner",
    });
    const mine = await createInvitation({
      kind: "member",
      groupId: group.id,
      createdById: admin.id,
      note: "mein",
    });
    await createInvitation({ kind: "member", groupId: other.id, createdById: otherAdmin.id });

    authMock.mockResolvedValue(sessionFor(member, group.id, "member"));
    expect((await GET()).status).toBe(403);

    authMock.mockResolvedValue(session);
    const res = await GET();
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: mine.id, note: "mein", usedCount: 0, uses: [] });
    expect(list[0].expiresAt).toBe(mine.expiresAt.toISOString());
    expect(typeof list[0].createdAt).toBe("string");
  });
});

describe("POST /api/invitations", () => {
  it("201 returns a url containing a 43-char token and stores note", async () => {
    const { group, session } = await setupGroupWithAdmin();
    authMock.mockResolvedValue(session);
    const res = await post({ note: "Anna" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.url).toMatch(/\/einladung\/[A-Za-z0-9_-]{43}$/);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const row = await prisma.invitation.findUniqueOrThrow({ where: { id: body.id } });
    expect(row).toMatchObject({ note: "Anna", groupId: group.id, kind: "member" });
  });

  it("accepts an empty body object and rejects an invalid note with 400", async () => {
    const { session } = await setupGroupWithAdmin();
    authMock.mockResolvedValue(session);
    expect((await post({})).status).toBe(201);
    const bad = await post({ note: "x".repeat(81) });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "invalid" });
  });
});

describe("DELETE /api/invitations/[id]", () => {
  it("204 then the link disappears from GET; 404 for another group's id", async () => {
    const { group, admin, session } = await setupGroupWithAdmin();
    const other = await createTestGroup("Andere");
    const otherAdmin = await createMember(other.id, {
      name: "O",
      email: "o@example.com",
      role: "owner",
    });
    const mine = await createInvitation({
      kind: "member",
      groupId: group.id,
      createdById: admin.id,
    });
    const foreign = await createInvitation({
      kind: "member",
      groupId: other.id,
      createdById: otherAdmin.id,
    });
    authMock.mockResolvedValue(session);

    const foreignRes = await del(foreign.id);
    expect(foreignRes.status).toBe(404);
    expect(await foreignRes.json()).toEqual({ error: "not_found" });
    expect(
      (await prisma.invitation.findUniqueOrThrow({ where: { id: foreign.id } })).revokedAt,
    ).toBeNull();

    expect((await del(mine.id)).status).toBe(204);
    expect(
      (await prisma.invitation.findUniqueOrThrow({ where: { id: mine.id } })).revokedAt,
    ).not.toBeNull();
    expect(await (await GET()).json()).toEqual([]);
    expect((await del(mine.id)).status).toBe(404);
  });
});
