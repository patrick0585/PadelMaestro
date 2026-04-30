import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/game-days/[id]/shuffle-preview/route";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function setup() {
  const year = new Date().getFullYear();
  const season = await prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
  const admin = await prisma.player.create({
    data: { name: "Admin", email: "admin@x", passwordHash: "x", isAdmin: true },
  });
  const member = await prisma.player.create({
    data: { name: "Mem", email: "mem@x", passwordHash: "x", isAdmin: false },
  });
  const gameDay = await prisma.gameDay.create({
    data: { seasonId: season.id, date: new Date("2026-04-21"), status: "planned" },
  });
  return { season, admin, member, gameDay };
}

function req(gameDayId: string) {
  return new Request(`http://localhost/api/game-days/${gameDayId}/shuffle-preview`, {
    method: "POST",
  });
}
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/game-days/[id]/shuffle-preview", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns 401 when unauthenticated", async () => {
    const { gameDay } = await setup();
    authMock.mockResolvedValue(null);
    const res = await POST(req(gameDay.id), ctx(gameDay.id));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin caller", async () => {
    const { gameDay, member } = await setup();
    authMock.mockResolvedValue({
      user: { id: member.id, isAdmin: false, email: member.email, name: member.name },
    });
    const res = await POST(req(gameDay.id), ctx(gameDay.id));
    expect(res.status).toBe(403);
  });

  it("returns 200 with a fresh seed for an admin on a planned day", async () => {
    const { gameDay, admin } = await setup();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await POST(req(gameDay.id), ctx(gameDay.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { seed: string };
    expect(body.seed).toBeTruthy();

    const after = await prisma.gameDay.findUniqueOrThrow({ where: { id: gameDay.id } });
    expect(after.seed).toBe(body.seed);
  });

  it("returns 409 not_planned once the day is in_progress", async () => {
    const { gameDay, admin } = await setup();
    await prisma.gameDay.update({
      where: { id: gameDay.id },
      data: { status: "in_progress" },
    });
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await POST(req(gameDay.id), ctx(gameDay.id));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("not_planned");
  });
});
