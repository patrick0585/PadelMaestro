import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createTestGroup, createMember, sessionFor } from "../helpers/group";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { POST } from "@/app/api/groups/active/transfer-owner/route";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

const post = (body: unknown) =>
  POST(
    new Request("http://test/api/groups/active/transfer-owner", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

async function roleOf(groupId: string, playerId: string) {
  const m = await prisma.membership.findUniqueOrThrow({
    where: { groupId_playerId: { groupId, playerId } },
  });
  return m.role;
}

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
});

describe("POST /api/groups/active/transfer-owner", () => {
  it("POST /api/groups/active/transfer-owner 403 for admin, 204 for owner, 409 self_transfer", async () => {
    const group = await createTestGroup();
    const owner = await createMember(group.id, { name: "Olga", email: "o@example.com", role: "owner" });
    const admin = await createMember(group.id, { name: "Armin", email: "a@example.com", role: "admin" });
    const target = await createMember(group.id, {
      name: "Martin",
      email: "m@example.com",
      passwordHash: "x",
    });

    authMock.mockResolvedValue(null);
    const unauth = await post({ playerId: target.id });
    expect(unauth.status).toBe(401);

    authMock.mockResolvedValue(sessionFor(admin, group.id, "admin"));
    const forbidden = await post({ playerId: target.id });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "forbidden" });
    expect(await roleOf(group.id, target.id)).toBe("member");

    authMock.mockResolvedValue(sessionFor(owner, group.id, "owner"));
    const invalid = await post({ playerId: "nope" });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "invalid" });

    const self = await post({ playerId: owner.id });
    expect(self.status).toBe(409);
    expect(await self.json()).toEqual({ error: "self_transfer" });

    const statsOnly = await createMember(group.id, { name: "Stats", email: "s@example.com" });
    const noLogin = await post({ playerId: statsOnly.id });
    expect(noLogin.status).toBe(409);
    expect(await noLogin.json()).toEqual({ error: "target_cannot_login" });
    expect(await roleOf(group.id, statsOnly.id)).toBe("member");

    const missing = await post({ playerId: "00000000-0000-4000-8000-000000000000" });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });

    const ok = await post({ playerId: target.id });
    expect(ok.status).toBe(204);
    expect(await roleOf(group.id, target.id)).toBe("owner");
    expect(await roleOf(group.id, owner.id)).toBe("admin");

    // Stale session still claims owner, but the DB says admin now.
    const stale = await post({ playerId: admin.id });
    expect(stale.status).toBe(403);
    expect(await stale.json()).toEqual({ error: "forbidden" });
    expect(await roleOf(group.id, admin.id)).toBe("admin");
  });
});
