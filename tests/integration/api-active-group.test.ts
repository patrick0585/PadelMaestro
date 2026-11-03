import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";
import { findActiveMembership } from "@/lib/group/active-membership";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { PATCH } from "@/app/api/profile/active-group/route";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

function req(body?: unknown): Request {
  return new Request("http://test/api/profile/active-group", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
});

describe("PATCH /api/profile/active-group", () => {
  it("401 without session, 403 for a foreign group, 204 and findActiveMembership returns it afterwards", async () => {
    const a = await createTestGroup("A");
    const b = await createTestGroup("B");
    const foreign = await createTestGroup("F");
    const me = await createMember(a.id, { name: "Me", email: "me@example.com" });
    await prisma.membership.create({ data: { groupId: b.id, playerId: me.id, role: "admin" } });

    authMock.mockResolvedValue(null);
    expect((await PATCH(req({ groupId: b.id }))).status).toBe(401);

    authMock.mockResolvedValue({ user: { id: me.id } });
    expect((await PATCH(req({ groupId: "nope" }))).status).toBe(400);
    const res = await PATCH(req({ groupId: foreign.id }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect((await prisma.player.findUniqueOrThrow({ where: { id: me.id } })).activeGroupId).toBeNull();

    expect((await PATCH(req({ groupId: b.id }))).status).toBe(204);
    const m = await findActiveMembership(prisma, me.id);
    expect(m?.groupId).toBe(b.id);
    expect(m?.role).toBe("admin");
  });
});
