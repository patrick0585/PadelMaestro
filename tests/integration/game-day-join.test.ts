import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { POST } from "@/app/api/game-days/[id]/join/route";
import { resetDb } from "../helpers/reset-db";
import {
  createMember,
  createTestGameDay,
  createTestGroup,
  createTestSeason,
  sessionFor,
} from "../helpers/group";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function setup() {
  const group = await createTestGroup();
  const admin = await createMember(group.id, {
    name: "Admin",
    email: "a@x",
    role: "owner",
    passwordHash: "x",
  });
  const day = await createGameDay(group.id, new Date("2026-04-21"), admin.id);
  return { group, admin, day };
}

function req(gameDayId: string) {
  return new Request(`http://localhost/api/game-days/${gameDayId}/join`, { method: "POST" });
}

function call(id: string) {
  return POST(req(id), { params: Promise.resolve({ id }) });
}

describe("POST /api/game-days/[id]/join", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("adds the caller as a pending participant when they are not yet one", async () => {
    const { group, day } = await setup();
    // stranger was created AFTER the game day, so they aren't a participant
    const stranger = await createMember(group.id, {
      name: "Stranger",
      email: "s@x",
      passwordHash: "x",
    });
    authMock.mockResolvedValue(sessionFor(stranger, group.id, "member"));
    const res = await call(day.id);
    expect(res.status).toBe(200);
    const p = await prisma.gameDayParticipant.findUnique({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: stranger.id } },
    });
    expect(p?.attendance).toBe("pending");
  });

  it("is idempotent when the caller is already a participant", async () => {
    const { group, admin, day } = await setup();
    authMock.mockResolvedValue(sessionFor(admin, group.id, "owner"));
    const res = await call(day.id);
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
    const { group, day } = await setup();
    const stranger = await createMember(group.id, {
      name: "Stranger",
      email: "s@x",
      passwordHash: "x",
    });
    authMock.mockResolvedValue(sessionFor(stranger, group.id, "member"));
    // First call: actual insert + audit log
    await call(day.id);
    // Second call: idempotent, no new audit log
    await call(day.id);
    const logs = await prisma.auditLog.findMany({
      where: { action: "game_day.self_join", actorId: stranger.id },
    });
    expect(logs).toHaveLength(1);
  });

  it("returns 401 for a soft-deleted player", async () => {
    const { group, day } = await setup();
    const ghost = await createMember(group.id, { name: "Ghost", email: "g@x", passwordHash: "x" });
    await prisma.player.update({ where: { id: ghost.id }, data: { deletedAt: new Date() } });
    authMock.mockResolvedValue(sessionFor(ghost, group.id, "member"));
    const res = await call(day.id);
    expect(res.status).toBe(401);
  });

  it("returns 401 when unauthenticated", async () => {
    const { day } = await setup();
    authMock.mockResolvedValue(null);
    const res = await call(day.id);
    expect(res.status).toBe(401);
  });

  it("returns 403 without a group", async () => {
    const { admin, day } = await setup();
    authMock.mockResolvedValue(sessionFor(admin, null, null));
    const res = await call(day.id);
    expect(res.status).toBe(403);
  });

  it("returns 404 when the game day does not exist", async () => {
    const { group, admin } = await setup();
    authMock.mockResolvedValue(sessionFor(admin, group.id, "owner"));
    const res = await call("00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("returns 404 for a game day of another group", async () => {
    const { group, admin } = await setup();
    const other = await createTestGroup("Andere");
    const otherSeason = await createTestSeason(other.id);
    const otherDay = await createTestGameDay(other.id, otherSeason.id);
    authMock.mockResolvedValue(sessionFor(admin, group.id, "owner"));
    const res = await call(otherDay.id);
    expect(res.status).toBe(404);
    const count = await prisma.gameDayParticipant.count({
      where: { gameDayId: otherDay.id, playerId: admin.id },
    });
    expect(count).toBe(0);
  });

  it("returns 409 when the game day is already locked", async () => {
    const { group, admin, day } = await setup();
    await prisma.gameDay.update({
      where: { id: day.id },
      data: { status: "in_progress" },
    });
    authMock.mockResolvedValue(sessionFor(admin, group.id, "owner"));
    const res = await call(day.id);
    expect(res.status).toBe(409);
  });
});
