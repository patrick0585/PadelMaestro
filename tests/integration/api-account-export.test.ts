import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";
import { rateLimitResetForTests } from "@/lib/rate-limit";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { GET } from "@/app/api/profile/export/route";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
  rateLimitResetForTests();
});

async function me() {
  const g = await createTestGroup("A");
  return createMember(g.id, { name: "Me", email: "me@example.com" });
}

describe("GET /api/profile/export", () => {
  it("GET /api/profile/export 401 without session, 200 with attachment header and filename date, writes audit account.export", async () => {
    const p = await me();
    authMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);

    authMock.mockResolvedValue({ user: { id: p.id } });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    const date = body.exportedAt.slice(0, 10);
    expect(res.headers.get("content-disposition")).toBe(
      `attachment; filename="padelmaestro-export-${date}.json"`,
    );
    expect(body.account.id).toBe(p.id);

    const rows = await prisma.auditLog.findMany({ where: { action: "account.export" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: p.id,
      groupId: null,
      entityType: "Player",
      entityId: p.id,
    });
    expect(rows[0].payload).toBeNull();
  });

  it("GET /api/profile/export 429 on the sixth call within an hour", async () => {
    const p = await me();
    authMock.mockResolvedValue({ user: { id: p.id } });
    for (let i = 0; i < 5; i++) expect((await GET()).status).toBe(200);
    const res = await GET();
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).not.toBeNull();
  });
});
