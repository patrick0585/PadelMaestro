import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { DELETE } from "@/app/api/game-days/[id]/route";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function setup(status: "planned" | "roster_locked" | "in_progress" | "finished") {
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

function delReq(id: string) {
  return new Request(`http://localhost/api/game-days/${id}`, { method: "DELETE" });
}
async function call(id: string) {
  return DELETE(delReq(id), { params: Promise.resolve({ id }) });
}

describe("DELETE /api/game-days/[id]", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("deletes a planned day and returns 204", async () => {
    const { admin, day } = await setup("planned");
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(204);
    expect(await prisma.gameDay.findUnique({ where: { id: day.id } })).toBeNull();
  });

  it("deletes a roster_locked day and cascades Match, GameDayParticipant, and JokerUse", async () => {
    const { admin, day } = await setup("roster_locked");
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });

    // Create three additional players for the four-player match slots
    const [p2, p3, p4] = await Promise.all([
      prisma.player.create({ data: { name: "P2", email: "p2@example.com", passwordHash: "x" } }),
      prisma.player.create({ data: { name: "P3", email: "p3@example.com", passwordHash: "x" } }),
      prisma.player.create({ data: { name: "P4", email: "p4@example.com", passwordHash: "x" } }),
    ]);

    await prisma.gameDayParticipant.create({
      data: { gameDayId: day.id, playerId: admin.id, attendance: "confirmed" },
    });

    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: admin.id,
        team1PlayerBId: p2.id,
        team2PlayerAId: p3.id,
        team2PlayerBId: p4.id,
      },
    });

    await prisma.jokerUse.create({
      data: {
        playerId: admin.id,
        seasonId: day.seasonId,
        gameDayId: day.id,
        ppgAtUse: "0",
        gamesCredited: 10,
        pointsCredited: "0",
      },
    });

    const res = await call(day.id);
    expect(res.status).toBe(204);
    expect(await prisma.match.count({ where: { gameDayId: day.id } })).toBe(0);
    expect(await prisma.gameDayParticipant.count({ where: { gameDayId: day.id } })).toBe(0);
    expect(await prisma.jokerUse.count({ where: { gameDayId: day.id } })).toBe(0);
  });

  it("returns 409 for in_progress", async () => {
    const { admin, day } = await setup("in_progress");
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(409);
  });

  it("returns 409 for finished", async () => {
    const { admin, day } = await setup("finished");
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(409);
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

  it("returns 401 when unauthenticated", async () => {
    const { day } = await setup("planned");
    authMock.mockResolvedValue(null);
    const res = await call(day.id);
    expect(res.status).toBe(401);
    expect(await prisma.gameDay.count({ where: { id: day.id } })).toBe(1);
  });

  it("returns 403 for non-admin", async () => {
    const { day } = await setup("planned");
    const user = await prisma.player.create({
      data: { name: "U", email: "u@example.com", passwordHash: "x" },
    });
    authMock.mockResolvedValue({
      user: { id: user.id, isAdmin: false, email: user.email, name: user.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(403);
    expect(await prisma.gameDay.count({ where: { id: day.id } })).toBe(1);
  });

  it("audit log entry persists after delete", async () => {
    const { admin, day } = await setup("planned");
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    await call(day.id);
    const entries = await prisma.auditLog.findMany({
      where: { action: "game_day.delete", entityId: day.id },
    });
    expect(entries).toHaveLength(1);
  });
});
