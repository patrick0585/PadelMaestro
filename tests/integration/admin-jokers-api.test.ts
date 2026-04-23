import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST, DELETE } from "@/app/api/game-days/[id]/participants/[playerId]/joker/route";
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
  const admin = await prisma.player.create({
    data: { name: "Admin", email: "a@x", passwordHash: "x", isAdmin: true },
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
  return { season, admin, player, gameDay };
}

function buildReq(method: "POST" | "DELETE", gameDayId: string, playerId: string) {
  return new Request(
    `http://localhost/api/game-days/${gameDayId}/participants/${playerId}/joker`,
    { method },
  );
}

describe("/api/game-days/[id]/participants/[playerId]/joker", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("POST returns 401 when unauthenticated", async () => {
    const { player, gameDay } = await setup();
    authMock.mockResolvedValue(null);
    const res = await POST(buildReq("POST", gameDay.id, player.id), {
      params: Promise.resolve({ id: gameDay.id, playerId: player.id }),
    });
    expect(res.status).toBe(401);
  });

  it("POST returns 403 for non-admin", async () => {
    const { player, gameDay } = await setup();
    authMock.mockResolvedValue({
      user: { id: player.id, isAdmin: false, email: player.email, name: player.name },
    });
    const res = await POST(buildReq("POST", gameDay.id, player.id), {
      params: Promise.resolve({ id: gameDay.id, playerId: player.id }),
    });
    expect(res.status).toBe(403);
  });

  it("POST returns 201 and sets attendance=joker", async () => {
    const { admin, player, gameDay } = await setup();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await POST(buildReq("POST", gameDay.id, player.id), {
      params: Promise.resolve({ id: gameDay.id, playerId: player.id }),
    });
    expect(res.status).toBe(201);
    const part = await prisma.gameDayParticipant.findUniqueOrThrow({
      where: { gameDayId_playerId: { gameDayId: gameDay.id, playerId: player.id } },
    });
    expect(part.attendance).toBe("joker");
  });

  it("DELETE returns 204 and clears the joker", async () => {
    const { admin, player, gameDay } = await setup();
    await recordJokerUse({ playerId: player.id, gameDayId: gameDay.id });
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await DELETE(buildReq("DELETE", gameDay.id, player.id), {
      params: Promise.resolve({ id: gameDay.id, playerId: player.id }),
    });
    expect(res.status).toBe(204);
    expect(await prisma.jokerUse.count()).toBe(0);
  });

  it("POST returns 409 JOKER_LOCKED when game day is roster_locked", async () => {
    const { admin, player, gameDay } = await setup();
    await prisma.gameDay.update({ where: { id: gameDay.id }, data: { status: "roster_locked" } });
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await POST(buildReq("POST", gameDay.id, player.id), {
      params: Promise.resolve({ id: gameDay.id, playerId: player.id }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "JOKER_LOCKED" });
  });

  it("DELETE returns 409 JOKER_NOT_FOUND when nothing to cancel", async () => {
    const { admin, player, gameDay } = await setup();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await DELETE(buildReq("DELETE", gameDay.id, player.id), {
      params: Promise.resolve({ id: gameDay.id, playerId: player.id }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "JOKER_NOT_FOUND" });
  });
});
