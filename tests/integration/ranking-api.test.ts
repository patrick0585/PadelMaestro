import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/ranking/route";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup, createTestSeason, sessionFor } from "../helpers/group";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/ranking", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("liefert pro Gruppe die eigene aktive Saison", async () => {
    const a = await createTestGroup("A");
    const b = await createTestGroup("B");
    const seasonA = await createTestSeason(a.id);
    const seasonB = await createTestSeason(b.id);
    const pa = await createMember(a.id, { name: "PA", email: "pa@x" });
    const pb = await createMember(b.id, { name: "PB", email: "pb@x" });

    authMock.mockResolvedValue(sessionFor(pa, a.id, "member"));
    const resA = await GET();
    expect(resA.status).toBe(200);
    expect((await resA.json()).season.id).toBe(seasonA.id);

    authMock.mockResolvedValue(sessionFor(pb, b.id, "member"));
    const resB = await GET();
    expect((await resB.json()).season.id).toBe(seasonB.id);
  });

  it("gibt 403 ohne Gruppe", async () => {
    const p = await prisma.player.create({ data: { name: "P", email: "p@x", passwordHash: "x" } });
    authMock.mockResolvedValue(sessionFor(p, null, null));
    expect((await GET()).status).toBe(403);
  });

  it("gibt 401 ohne Session", async () => {
    authMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
});
