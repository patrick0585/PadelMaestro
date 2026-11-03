import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/hash";
import { rateLimitResetForTests } from "@/lib/rate-limit";
import { resetDb } from "../helpers/reset-db";
import { createTestGroup, createMember, sessionFor } from "../helpers/group";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { PATCH, DELETE } from "@/app/api/groups/active/route";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

const req = (method: string, body: unknown) =>
  new Request("http://test/api/groups/active", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  await resetDb();
  rateLimitResetForTests();
  authMock.mockReset();
});

describe("/api/groups/active", () => {
  it("PATCH /api/groups/active 403 for admin, 200 for owner; DELETE 400 name_mismatch, 403 wrong_password, 204 then group gone", async () => {
    const group = await createTestGroup("Padelfreunde");
    const passwordHash = await hashPassword("geheim-123");
    const owner = await createMember(group.id, {
      name: "Olga",
      email: "o@example.com",
      role: "owner",
      passwordHash,
    });
    const admin = await createMember(group.id, {
      name: "Armin",
      email: "a@example.com",
      role: "admin",
      passwordHash,
    });

    authMock.mockResolvedValue(null);
    expect((await PATCH(req("PATCH", { name: "X-Team" }))).status).toBe(401);

    authMock.mockResolvedValue(sessionFor(admin, group.id, "admin"));
    const forbidden = await PATCH(req("PATCH", { name: "Adminteam" }));
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "forbidden" });
    const delForbidden = await DELETE(req("DELETE", { name: "Padelfreunde", password: "geheim-123" }));
    expect(delForbidden.status).toBe(403);
    expect(await delForbidden.json()).toEqual({ error: "forbidden" });

    authMock.mockResolvedValue(sessionFor(owner, group.id, "owner"));
    const invalid = await PATCH(req("PATCH", { name: " x " }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "invalid" });

    const ok = await PATCH(req("PATCH", { name: "  Padel Profis " }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ name: "Padel Profis" });
    expect((await prisma.group.findUniqueOrThrow({ where: { id: group.id } })).name).toBe("Padel Profis");

    const badBody = await DELETE(req("DELETE", { name: "Padel Profis", password: "" }));
    expect(badBody.status).toBe(400);
    expect(await badBody.json()).toEqual({ error: "invalid" });

    const mismatch = await DELETE(req("DELETE", { name: "Padelfreunde", password: "geheim-123" }));
    expect(mismatch.status).toBe(400);
    expect(await mismatch.json()).toEqual({ error: "name_mismatch" });

    const wrong = await DELETE(req("DELETE", { name: "Padel Profis", password: "falsch" }));
    expect(wrong.status).toBe(403);
    expect(await wrong.json()).toEqual({ error: "wrong_password" });
    expect(await prisma.group.count({ where: { id: group.id } })).toBe(1);

    const gone = await DELETE(req("DELETE", { name: "Padel Profis", password: "geheim-123" }));
    expect(gone.status).toBe(204);
    expect(await prisma.group.count({ where: { id: group.id } })).toBe(0);
    expect(await prisma.player.count({ where: { id: { in: [owner.id, admin.id] } } })).toBe(2);
  });

  it("DELETE is rate limited to 5 attempts per hour per account", async () => {
    const group = await createTestGroup("Padelfreunde");
    const owner = await createMember(group.id, {
      name: "Olga",
      email: "o@example.com",
      role: "owner",
      passwordHash: await hashPassword("geheim-123"),
    });
    authMock.mockResolvedValue(sessionFor(owner, group.id, "owner"));
    for (let i = 0; i < 5; i++) {
      expect((await DELETE(req("DELETE", { name: "Falsch", password: "x" }))).status).toBe(400);
    }
    const limited = await DELETE(req("DELETE", { name: "Padelfreunde", password: "geheim-123" }));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    expect(await prisma.group.count({ where: { id: group.id } })).toBe(1);
  });
});
