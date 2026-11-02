import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { PATCH } from "@/app/api/game-days/[id]/participants/[playerId]/route";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup, sessionFor } from "../helpers/group";

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
  const other = await createMember(group.id, { name: "Ben", email: "b@x", passwordHash: "x" });
  const day = await createGameDay(group.id, new Date("2026-04-21"), admin.id);
  return { group, admin, other, day };
}

function req(gameDayId: string, playerId: string, body: unknown) {
  return new Request(
    `http://localhost/api/game-days/${gameDayId}/participants/${playerId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    },
  );
}

describe("PATCH /api/game-days/[id]/participants/[playerId]", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("admin can confirm another player's attendance", async () => {
    const { group, admin, other, day } = await setup();
    authMock.mockResolvedValue(sessionFor(admin, group.id, "owner"));
    const res = await PATCH(req(day.id, other.id, { status: "confirmed" }), {
      params: Promise.resolve({ id: day.id, playerId: other.id }),
    });
    expect(res.status).toBe(200);
    const p = await prisma.gameDayParticipant.findUniqueOrThrow({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: other.id } },
    });
    expect(p.attendance).toBe("confirmed");
  });

  it("returns 403 for non-admin users", async () => {
    const { group, other, day } = await setup();
    authMock.mockResolvedValue(sessionFor(other, group.id, "member"));
    const res = await PATCH(req(day.id, other.id, { status: "confirmed" }), {
      params: Promise.resolve({ id: day.id, playerId: other.id }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    const { other, day } = await setup();
    authMock.mockResolvedValue(null);
    const res = await PATCH(req(day.id, other.id, { status: "confirmed" }), {
      params: Promise.resolve({ id: day.id, playerId: other.id }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid status value", async () => {
    const { group, admin, other, day } = await setup();
    authMock.mockResolvedValue(sessionFor(admin, group.id, "owner"));
    const res = await PATCH(req(day.id, other.id, { status: "maybe" }), {
      params: Promise.resolve({ id: day.id, playerId: other.id }),
    });
    expect(res.status).toBe(400);
  });

  it("creates a participant row when the player has none yet", async () => {
    const { group, admin, day } = await setup();
    const latecomer = await createMember(group.id, { name: "L", email: "l@x", passwordHash: "x" });
    authMock.mockResolvedValue(sessionFor(admin, group.id, "owner"));
    const res = await PATCH(req(day.id, latecomer.id, { status: "confirmed" }), {
      params: Promise.resolve({ id: day.id, playerId: latecomer.id }),
    });
    expect(res.status).toBe(200);
    const p = await prisma.gameDayParticipant.findUniqueOrThrow({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: latecomer.id } },
    });
    expect(p.attendance).toBe("confirmed");
  });

  it("404 player_not_found für Spieler einer anderen Gruppe", async () => {
    const { group, admin, day } = await setup();
    const otherGroup = await createTestGroup("Andere");
    const stranger = await createMember(otherGroup.id, { name: "S", email: "s@x", passwordHash: "x" });
    authMock.mockResolvedValue(sessionFor(admin, group.id, "owner"));
    const res = await PATCH(req(day.id, stranger.id, { status: "confirmed" }), {
      params: Promise.resolve({ id: day.id, playerId: stranger.id }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "player_not_found" });
    expect(
      await prisma.gameDayParticipant.count({ where: { gameDayId: day.id, playerId: stranger.id } }),
    ).toBe(0);
  });

  it("404 für entferntes Mitglied", async () => {
    const { group, admin, other, day } = await setup();
    await prisma.membership.updateMany({
      where: { groupId: group.id, playerId: other.id },
      data: { removedAt: new Date() },
    });
    authMock.mockResolvedValue(sessionFor(admin, group.id, "owner"));
    const res = await PATCH(req(day.id, other.id, { status: "confirmed" }), {
      params: Promise.resolve({ id: day.id, playerId: other.id }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "player_not_found" });
    const p = await prisma.gameDayParticipant.findUniqueOrThrow({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: other.id } },
    });
    expect(p.attendance).toBe("pending");
  });

  it("returns 404 when the player does not exist or is soft-deleted", async () => {
    const { group, admin, other, day } = await setup();
    await prisma.player.update({
      where: { id: other.id },
      data: { deletedAt: new Date() },
    });
    authMock.mockResolvedValue(sessionFor(admin, group.id, "owner"));
    const res = await PATCH(req(day.id, other.id, { status: "confirmed" }), {
      params: Promise.resolve({ id: day.id, playerId: other.id }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when the roster is already locked", async () => {
    const { group, admin, other, day } = await setup();
    await prisma.gameDay.update({
      where: { id: day.id },
      data: { status: "in_progress" },
    });
    authMock.mockResolvedValue(sessionFor(admin, group.id, "owner"));
    const res = await PATCH(req(day.id, other.id, { status: "confirmed" }), {
      params: Promise.resolve({ id: day.id, playerId: other.id }),
    });
    expect(res.status).toBe(409);
  });

  it("returns 404 für Spieltag einer anderen Gruppe and writes nothing", async () => {
    const { other, day } = await setup();
    const otherGroup = await createTestGroup("Andere");
    const otherAdmin = await createMember(otherGroup.id, {
      name: "Other",
      email: "other@example.com",
      role: "owner",
      passwordHash: "x",
    });
    authMock.mockResolvedValue(sessionFor(otherAdmin, otherGroup.id, "owner"));
    const res = await PATCH(req(day.id, other.id, { status: "confirmed" }), {
      params: Promise.resolve({ id: day.id, playerId: other.id }),
    });
    expect(res.status).toBe(404);
    const p = await prisma.gameDayParticipant.findUniqueOrThrow({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: other.id } },
    });
    expect(p.attendance).toBe("pending");
  });
});
