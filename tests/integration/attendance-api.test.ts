import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/game-days/[id]/attendance/route";
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
  const season = await createTestSeason(group.id);
  const player = await createMember(group.id, { name: "P", email: "p@x", passwordHash: "x" });
  const gameDay = await createTestGameDay(group.id, season.id, {
    date: new Date("2026-04-21"),
  });
  return { group, season, player, gameDay };
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

  it("returns 403 without a group", async () => {
    const { player, gameDay } = await setup();
    authMock.mockResolvedValue(sessionFor(player, null, null));
    const res = await POST(req(gameDay.id, { status: "confirmed" }), ctx(gameDay.id));
    expect(res.status).toBe(403);
  });

  it("returns 404 for a game day of another group", async () => {
    const { group, player } = await setup();
    const other = await createTestGroup("Andere");
    const otherSeason = await createTestSeason(other.id);
    const otherDay = await createTestGameDay(other.id, otherSeason.id);
    await prisma.gameDayParticipant.create({
      data: { gameDayId: otherDay.id, playerId: player.id, attendance: "pending" },
    });
    authMock.mockResolvedValue(sessionFor(player, group.id, "member"));
    const res = await POST(req(otherDay.id, { status: "confirmed" }), ctx(otherDay.id));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: "ATTENDANCE_GAME_DAY_NOT_FOUND" });
    const p = await prisma.gameDayParticipant.findUniqueOrThrow({
      where: { gameDayId_playerId: { gameDayId: otherDay.id, playerId: player.id } },
    });
    expect(p.attendance).toBe("pending");
  });

  it("returns 200 with the updated participant when the player is on the roster", async () => {
    const { group, player, gameDay } = await setup();
    await prisma.gameDayParticipant.create({
      data: { gameDayId: gameDay.id, playerId: player.id, attendance: "pending" },
    });
    authMock.mockResolvedValue(sessionFor(player, group.id, "member"));
    const res = await POST(req(gameDay.id, { status: "confirmed" }), ctx(gameDay.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.participant).toBeDefined();
    expect(body.participant.attendance).toBe("confirmed");
    expect(body.participant.playerId).toBe(player.id);
  });

  it("returns 403 with code ATTENDANCE_NOT_PARTICIPANT when the player is not on the roster", async () => {
    const { group, player, gameDay } = await setup();
    authMock.mockResolvedValue(sessionFor(player, group.id, "member"));
    const res = await POST(req(gameDay.id, { status: "confirmed" }), ctx(gameDay.id));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ code: "ATTENDANCE_NOT_PARTICIPANT" });
  });

  it("returns 409 with code ATTENDANCE_LOCKED when the day is in_progress", async () => {
    const { group, player, gameDay } = await setup();
    await prisma.gameDayParticipant.create({
      data: { gameDayId: gameDay.id, playerId: player.id, attendance: "pending" },
    });
    await prisma.gameDay.update({ where: { id: gameDay.id }, data: { status: "in_progress" } });
    authMock.mockResolvedValue(sessionFor(player, group.id, "member"));
    const res = await POST(req(gameDay.id, { status: "confirmed" }), ctx(gameDay.id));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ code: "ATTENDANCE_LOCKED" });
  });

  it("returns 404 with code ATTENDANCE_GAME_DAY_NOT_FOUND for an unknown game day", async () => {
    const { group, player } = await setup();
    authMock.mockResolvedValue(sessionFor(player, group.id, "member"));
    const unknown = "00000000-0000-0000-0000-000000000000";
    const res = await POST(req(unknown, { status: "confirmed" }), ctx(unknown));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ code: "ATTENDANCE_GAME_DAY_NOT_FOUND" });
  });

  it("returns 400 on invalid body", async () => {
    const { group, player, gameDay } = await setup();
    authMock.mockResolvedValue(sessionFor(player, group.id, "member"));
    const res = await POST(req(gameDay.id, { status: "foo" }), ctx(gameDay.id));
    expect(res.status).toBe(400);
  });
});
