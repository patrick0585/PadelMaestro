import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { DELETE, POST } from "@/app/api/jokers/route";
import { recordJokerUse } from "@/lib/joker/use";
import { resetDb } from "../helpers/reset-db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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
  await prisma.gameDayParticipant.create({
    data: { gameDayId: gameDay.id, playerId: player.id, attendance: "pending" },
  });
  return { season, player, gameDay };
}

function req(body: unknown) {
  return new Request("http://localhost/api/jokers", {
    method: "DELETE",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function postReq(body: unknown) {
  return new Request("http://localhost/api/jokers", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("DELETE /api/jokers", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns 401 when unauthenticated", async () => {
    const { gameDay } = await setup();
    authMock.mockResolvedValue(null);
    const res = await DELETE(req({ gameDayId: gameDay.id }));
    expect(res.status).toBe(401);
  });

  it("returns 204 and clears the joker on success", async () => {
    const { player, gameDay } = await setup();
    await recordJokerUse({ playerId: player.id, gameDayId: gameDay.id });
    authMock.mockResolvedValue({
      user: { id: player.id, isAdmin: false, email: player.email, name: player.name },
    });
    const res = await DELETE(req({ gameDayId: gameDay.id }));
    expect(res.status).toBe(204);
    expect(await prisma.jokerUse.count()).toBe(0);
  });

  it("returns 409 JOKER_NOT_FOUND when no joker is set", async () => {
    const { player, gameDay } = await setup();
    authMock.mockResolvedValue({
      user: { id: player.id, isAdmin: false, email: player.email, name: player.name },
    });
    const res = await DELETE(req({ gameDayId: gameDay.id }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "JOKER_NOT_FOUND" });
  });

  it("returns 409 JOKER_LOCKED when the day is no longer planned", async () => {
    const { player, gameDay } = await setup();
    await recordJokerUse({ playerId: player.id, gameDayId: gameDay.id });
    await prisma.gameDay.update({ where: { id: gameDay.id }, data: { status: "in_progress" } });
    authMock.mockResolvedValue({
      user: { id: player.id, isAdmin: false, email: player.email, name: player.name },
    });
    const res = await DELETE(req({ gameDayId: gameDay.id }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "JOKER_LOCKED" });
  });
});

describe("POST /api/jokers", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns 401 when unauthenticated", async () => {
    const { gameDay } = await setup();
    authMock.mockResolvedValue(null);
    const res = await POST(postReq({ gameDayId: gameDay.id }));
    expect(res.status).toBe(401);
  });

  it("returns 409 JOKER_LOCKED when the game day is in_progress", async () => {
    const { player, gameDay } = await setup();
    await prisma.gameDay.update({ where: { id: gameDay.id }, data: { status: "in_progress" } });
    authMock.mockResolvedValue({
      user: { id: player.id, isAdmin: false, email: player.email, name: player.name },
    });
    const res = await POST(postReq({ gameDayId: gameDay.id }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "JOKER_LOCKED" });
  });

  it("returns 409 JOKER_CAP_EXCEEDED when the season cap is reached", async () => {
    const { season, player, gameDay } = await setup();

    // Create a second game day in the same season so we can use two jokers
    const gameDay2 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-28"), status: "planned" },
    });
    await prisma.gameDayParticipant.create({
      data: { gameDayId: gameDay2.id, playerId: player.id, attendance: "pending" },
    });

    // Exhaust MAX_JOKERS_PER_SEASON slots
    await recordJokerUse({ playerId: player.id, gameDayId: gameDay.id });
    await recordJokerUse({ playerId: player.id, gameDayId: gameDay2.id });

    // Third game day to attempt the cap-exceeding POST
    const gameDay3 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-05-05"), status: "planned" },
    });
    await prisma.gameDayParticipant.create({
      data: { gameDayId: gameDay3.id, playerId: player.id, attendance: "pending" },
    });

    authMock.mockResolvedValue({
      user: { id: player.id, isAdmin: false, email: player.email, name: player.name },
    });
    const res = await POST(postReq({ gameDayId: gameDay3.id }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "JOKER_CAP_EXCEEDED" });
  });
});
