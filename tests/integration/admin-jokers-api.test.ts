import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST, DELETE } from "@/app/api/game-days/[id]/participants/[playerId]/joker/route";
import { recordJokerUse } from "@/lib/joker/use";
import { resetDb } from "../helpers/reset-db";
import {
  createMember,
  createTestGameDay,
  createTestGroup,
  createTestSeason,
  sessionFor,
  setupGroupWithAdmin,
} from "../helpers/group";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function setup() {
  const { group, admin, session } = await setupGroupWithAdmin();
  const season = await createTestSeason(group.id);
  const player = await createMember(group.id, { name: "P", email: "p@x", passwordHash: "x" });
  const gameDay = await createTestGameDay(group.id, season.id, {
    date: new Date("2026-04-21"),
    status: "planned",
  });
  await prisma.gameDayParticipant.create({
    data: { gameDayId: gameDay.id, playerId: player.id, attendance: "pending" },
  });
  return { group, season, admin, player, gameDay, session };
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
    const { group, player, gameDay } = await setup();
    authMock.mockResolvedValue(sessionFor(player, group.id, "member"));
    const res = await POST(buildReq("POST", gameDay.id, player.id), {
      params: Promise.resolve({ id: gameDay.id, playerId: player.id }),
    });
    expect(res.status).toBe(403);
  });

  it("POST returns 201 and sets attendance=joker", async () => {
    const { session, player, gameDay } = await setup();
    authMock.mockResolvedValue(session);
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
    const { session, player, gameDay } = await setup();
    await recordJokerUse({ playerId: player.id, gameDayId: gameDay.id });
    authMock.mockResolvedValue(session);
    const res = await DELETE(buildReq("DELETE", gameDay.id, player.id), {
      params: Promise.resolve({ id: gameDay.id, playerId: player.id }),
    });
    expect(res.status).toBe(204);
    expect(await prisma.jokerUse.count()).toBe(0);
  });

  it("POST returns 409 JOKER_LOCKED when game day is in_progress", async () => {
    const { session, player, gameDay } = await setup();
    await prisma.gameDay.update({ where: { id: gameDay.id }, data: { status: "in_progress" } });
    authMock.mockResolvedValue(session);
    const res = await POST(buildReq("POST", gameDay.id, player.id), {
      params: Promise.resolve({ id: gameDay.id, playerId: player.id }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "JOKER_LOCKED" });
  });

  it("DELETE returns 409 JOKER_NOT_FOUND when nothing to cancel", async () => {
    const { session, player, gameDay } = await setup();
    authMock.mockResolvedValue(session);
    const res = await DELETE(buildReq("DELETE", gameDay.id, player.id), {
      params: Promise.resolve({ id: gameDay.id, playerId: player.id }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "JOKER_NOT_FOUND" });
  });

  describe("game day of another group", () => {
    async function asOtherAdmin() {
      const otherGroup = await createTestGroup("Andere");
      const otherAdmin = await createMember(otherGroup.id, {
        name: "Other",
        email: "other@example.com",
        role: "owner",
        passwordHash: "x",
      });
      authMock.mockResolvedValue(sessionFor(otherAdmin, otherGroup.id, "owner"));
    }

    it("POST returns 404 für Spieltag einer anderen Gruppe and writes no joker", async () => {
      const { player, gameDay } = await setup();
      await asOtherAdmin();
      const res = await POST(buildReq("POST", gameDay.id, player.id), {
        params: Promise.resolve({ id: gameDay.id, playerId: player.id }),
      });
      expect(res.status).toBe(404);
      expect(await prisma.jokerUse.count()).toBe(0);
      const part = await prisma.gameDayParticipant.findUniqueOrThrow({
        where: { gameDayId_playerId: { gameDayId: gameDay.id, playerId: player.id } },
      });
      expect(part.attendance).toBe("pending");
    });

    it("DELETE returns 404 für Spieltag einer anderen Gruppe and keeps the joker", async () => {
      const { player, gameDay } = await setup();
      await recordJokerUse({ playerId: player.id, gameDayId: gameDay.id });
      await asOtherAdmin();
      const res = await DELETE(buildReq("DELETE", gameDay.id, player.id), {
        params: Promise.resolve({ id: gameDay.id, playerId: player.id }),
      });
      expect(res.status).toBe(404);
      expect(await prisma.jokerUse.count()).toBe(1);
    });
  });
});
