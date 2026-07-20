import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/seasons/close/route";
import { getOrCreateActiveSeason } from "@/lib/season";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request("http://localhost/api/seasons/close", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function makeAdmin() {
  return prisma.player.create({
    data: { name: "Admin", email: "admin@x", passwordHash: "x", isAdmin: true },
  });
}

describe("POST /api/seasons/close", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(req({ closedName: "A", nextName: "B" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admins", async () => {
    const player = await prisma.player.create({
      data: { name: "P", email: "p@x", passwordHash: "x" },
    });
    authMock.mockResolvedValue({ user: { id: player.id, isAdmin: false } });
    const res = await POST(req({ closedName: "A", nextName: "B" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid body", async () => {
    const admin = await makeAdmin();
    authMock.mockResolvedValue({ user: { id: admin.id, isAdmin: true } });
    const res = await POST(req({ closedName: "A" }));
    expect(res.status).toBe(400);
  });

  it("closes the season and returns both seasons", async () => {
    const admin = await makeAdmin();
    await getOrCreateActiveSeason();
    authMock.mockResolvedValue({ user: { id: admin.id, isAdmin: true } });
    const res = await POST(req({ closedName: "Hinrunde 2026", nextName: "Rückrunde 2026" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.closedSeason.name).toBe("Hinrunde 2026");
    expect(body.newSeason.name).toBe("Rückrunde 2026");
  });

  it("returns 409 open_game_days with the blocking dates", async () => {
    const admin = await makeAdmin();
    const season = await getOrCreateActiveSeason();
    await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-07-21"), status: "planned" },
    });
    authMock.mockResolvedValue({ user: { id: admin.id, isAdmin: true } });
    const res = await POST(req({ closedName: "A", nextName: "B" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("open_game_days");
    expect(body.days).toEqual(["2026-07-21"]);
  });

  it("returns 400 invalid_names for identical names", async () => {
    const admin = await makeAdmin();
    await getOrCreateActiveSeason();
    authMock.mockResolvedValue({ user: { id: admin.id, isAdmin: true } });
    const res = await POST(req({ closedName: "X", nextName: "X" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_names");
  });
});
