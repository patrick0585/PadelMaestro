import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { POST } from "@/app/api/game-days/[id]/join/route";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function setup() {
  const admin = await prisma.player.create({
    data: { name: "Admin", email: "a@x", isAdmin: true, passwordHash: "x" },
  });
  const day = await createGameDay(new Date("2026-04-21"), admin.id);
  return { admin, day };
}

function req(gameDayId: string) {
  return new Request(`http://localhost/api/game-days/${gameDayId}/join`, { method: "POST" });
}

describe("POST /api/game-days/[id]/join", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("adds the caller as a pending participant when they are not yet one", async () => {
    const { day } = await setup();
    // stranger was created AFTER the game day, so they aren't a participant
    const stranger = await prisma.player.create({
      data: { name: "Stranger", email: "s@x", passwordHash: "x" },
    });
    authMock.mockResolvedValue({
      user: { id: stranger.id, isAdmin: false, email: stranger.email, name: stranger.name },
    });
    const res = await POST(req(day.id), { params: Promise.resolve({ id: day.id }) });
    expect(res.status).toBe(200);
    const p = await prisma.gameDayParticipant.findUnique({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: stranger.id } },
    });
    expect(p?.attendance).toBe("pending");
  });

  it("is idempotent when the caller is already a participant", async () => {
    const { admin, day } = await setup();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await POST(req(day.id), { params: Promise.resolve({ id: day.id }) });
    expect(res.status).toBe(200);
    const count = await prisma.gameDayParticipant.count({
      where: { gameDayId: day.id, playerId: admin.id },
    });
    expect(count).toBe(1);
    // No audit log should be written for the no-op case
    const logs = await prisma.auditLog.count({
      where: { action: "game_day.self_join", actorId: admin.id },
    });
    expect(logs).toBe(0);
  });

  it("writes an audit log only on actual insert", async () => {
    const { day } = await setup();
    const stranger = await prisma.player.create({
      data: { name: "Stranger", email: "s@x", passwordHash: "x" },
    });
    authMock.mockResolvedValue({
      user: { id: stranger.id, isAdmin: false, email: stranger.email, name: stranger.name },
    });
    // First call: actual insert + audit log
    await POST(req(day.id), { params: Promise.resolve({ id: day.id }) });
    // Second call: idempotent, no new audit log
    await POST(req(day.id), { params: Promise.resolve({ id: day.id }) });
    const logs = await prisma.auditLog.findMany({
      where: { action: "game_day.self_join", actorId: stranger.id },
    });
    expect(logs).toHaveLength(1);
  });

  it("returns 401 for a soft-deleted player", async () => {
    const { day } = await setup();
    const ghost = await prisma.player.create({
      data: { name: "Ghost", email: "g@x", passwordHash: "x", deletedAt: new Date() },
    });
    authMock.mockResolvedValue({
      user: { id: ghost.id, isAdmin: false, email: ghost.email, name: ghost.name },
    });
    const res = await POST(req(day.id), { params: Promise.resolve({ id: day.id }) });
    expect(res.status).toBe(401);
  });

  it("returns 401 when unauthenticated", async () => {
    const { day } = await setup();
    authMock.mockResolvedValue(null);
    const res = await POST(req(day.id), { params: Promise.resolve({ id: day.id }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the game day does not exist", async () => {
    const { admin } = await setup();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await POST(
      req("00000000-0000-0000-0000-000000000000"),
      { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when the game day is already locked", async () => {
    const { admin, day } = await setup();
    await prisma.gameDay.update({
      where: { id: day.id },
      data: { status: "roster_locked" },
    });
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await POST(req(day.id), { params: Promise.resolve({ id: day.id }) });
    expect(res.status).toBe(409);
  });
});
