import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/game-days/[id]/finish/route";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function setup(status: "planned" | "in_progress" | "finished") {
  const admin = await prisma.player.create({
    data: { name: "A", email: `a-${status}@example.com`, passwordHash: "x", isAdmin: true },
  });
  const year = new Date().getFullYear();
  const season = await prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
  const day = await prisma.gameDay.create({
    data: { seasonId: season.id, date: new Date("2026-04-21"), status },
  });
  return { admin, day };
}

function postReq(id: string) {
  return new Request(`http://localhost/api/game-days/${id}/finish`, { method: "POST" });
}
async function call(id: string) {
  return POST(postReq(id), { params: Promise.resolve({ id }) });
}

describe("POST /api/game-days/[id]/finish", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns 204 and flips in_progress to finished", async () => {
    const { admin, day } = await setup("in_progress");
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(204);
    const after = await prisma.gameDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(after.status).toBe("finished");
  });

  it("returns 409 when already finished", async () => {
    const { admin, day } = await setup("finished");
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(409);
  });

  it("returns 409 when planned", async () => {
    const { admin, day } = await setup("planned");
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(409);
  });

  it("returns 403 for non-admin", async () => {
    const { day } = await setup("in_progress");
    const user = await prisma.player.create({
      data: { name: "U", email: "u@example.com", passwordHash: "x" },
    });
    authMock.mockResolvedValue({
      user: { id: user.id, isAdmin: false, email: user.email, name: user.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown id", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call("00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});
