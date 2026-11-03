import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createTestGroup, createMember, sessionFor } from "../helpers/group";
import { createInvitation } from "@/lib/invitations/create";
import { joinWithInvitation } from "@/lib/invitations/redeem";
import { findActiveMembership } from "@/lib/group/active-membership";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { POST } from "@/app/api/groups/route";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

const post = (body: unknown) =>
  POST(
    new Request("http://test/api/groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

async function player() {
  const g = await createTestGroup("Heimat");
  const p = await createMember(g.id, { name: "Fritz", email: "f@example.com", passwordHash: "x" });
  authMock.mockResolvedValue(sessionFor(p, g.id, "member"));
  return p;
}

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
});

describe("POST /api/groups", () => {
  it("401 without session, 403 without founder use, 201 with founder use and the new group is the newest membership", async () => {
    authMock.mockResolvedValue(null);
    const unauth = await post({ name: "Neue Gruppe" });
    expect(unauth.status).toBe(401);
    expect(await unauth.json()).toEqual({ error: "unauthorized" });

    const p = await player();
    const forbidden = await post({ name: "Neue Gruppe" });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "no_founder_invitation" });
    expect(await prisma.group.count({ where: { name: "Neue Gruppe" } })).toBe(0);

    const inv = await createInvitation({ kind: "founder" });
    await joinWithInvitation({ token: inv.token, playerId: p.id });
    const res = await post({ name: "Neue Gruppe" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ name: "Neue Gruppe" });
    expect(body.slug).toEqual(expect.any(String));
    const row = await prisma.group.findUniqueOrThrow({ where: { id: body.id } });
    expect(row.slug).toBe(body.slug);
    expect(await findActiveMembership(prisma, p.id)).toEqual({ groupId: body.id, role: "owner" });
  });

  it("400 for a one-character name", async () => {
    await player();
    const res = await post({ name: "X" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid" });
  });
});
