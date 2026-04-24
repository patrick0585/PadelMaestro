import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/game-days/[id]/attendance/route";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function setup() {
  const year = new Date().getFullYear();
  const season = await prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
  const player = await prisma.player.create({
    data: { name: "P", email: "p@x", passwordHash: "x" },
  });
  const gameDay = await prisma.gameDay.create({
    data: { seasonId: season.id, date: new Date("2026-04-21"), status: "planned" },
  });
  return { season, player, gameDay };
}

function req(gameDayId: string, body: unknown) {
  return new Request(`http://localhost/api/game-days/${gameDayId}/attendance`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/game-days/[id]/attendance", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns 401 when unauthenticated", async () => {
    const { gameDay } = await setup();
    authMock.mockResolvedValue(null);
    const res = await POST(req(gameDay.id, { status: "confirmed" }), ctx(gameDay.id));
    expect(res.status).toBe(401);
  });

  it("returns 200 with the updated participant when the player is on the roster", async () => {
    const { player, gameDay } = await setup();
    await prisma.gameDayParticipant.create({
      data: { gameDayId: gameDay.id, playerId: player.id, attendance: "pending" },
    });
    authMock.mockResolvedValue({ user: { id: player.id } });
    const res = await POST(req(gameDay.id, { status: "confirmed" }), ctx(gameDay.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.participant).toBeDefined();
    expect(body.participant.attendance).toBe("confirmed");
    expect(body.participant.playerId).toBe(player.id);
  });

  it("returns 403 with code ATTENDANCE_NOT_PARTICIPANT when the player is not on the roster", async () => {
    const { player, gameDay } = await setup();
    authMock.mockResolvedValue({ user: { id: player.id } });
    const res = await POST(req(gameDay.id, { status: "confirmed" }), ctx(gameDay.id));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ code: "ATTENDANCE_NOT_PARTICIPANT" });
  });

  it("returns 409 with code ATTENDANCE_LOCKED when the day is roster_locked", async () => {
    const { player, gameDay } = await setup();
    await prisma.gameDayParticipant.create({
      data: { gameDayId: gameDay.id, playerId: player.id, attendance: "pending" },
    });
    await prisma.gameDay.update({ where: { id: gameDay.id }, data: { status: "roster_locked" } });
    authMock.mockResolvedValue({ user: { id: player.id } });
    const res = await POST(req(gameDay.id, { status: "confirmed" }), ctx(gameDay.id));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ code: "ATTENDANCE_LOCKED" });
  });

  it("returns 404 with code ATTENDANCE_GAME_DAY_NOT_FOUND for an unknown game day", async () => {
    const { player } = await setup();
    authMock.mockResolvedValue({ user: { id: player.id } });
    const unknown = "00000000-0000-0000-0000-000000000000";
    const res = await POST(req(unknown, { status: "confirmed" }), ctx(unknown));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ code: "ATTENDANCE_GAME_DAY_NOT_FOUND" });
  });

  it("returns 400 on invalid body", async () => {
    const { player, gameDay } = await setup();
    authMock.mockResolvedValue({ user: { id: player.id } });
    const res = await POST(req(gameDay.id, { status: "foo" }), ctx(gameDay.id));
    expect(res.status).toBe(400);
  });
});
