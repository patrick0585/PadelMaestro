import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { PATCH } from "@/app/api/game-days/[id]/participants/[playerId]/route";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function setup() {
  const admin = await prisma.player.create({
    data: { name: "Admin", email: "a@x", isAdmin: true, passwordHash: "x" },
  });
  const other = await prisma.player.create({
    data: { name: "Ben", email: "b@x", passwordHash: "x" },
  });
  const day = await createGameDay(new Date("2026-04-21"), admin.id);
  return { admin, other, day };
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
    const { admin, other, day } = await setup();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
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
    const { other, day } = await setup();
    authMock.mockResolvedValue({
      user: { id: other.id, isAdmin: false, email: other.email, name: other.name },
    });
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
    const { admin, other, day } = await setup();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await PATCH(req(day.id, other.id, { status: "maybe" }), {
      params: Promise.resolve({ id: day.id, playerId: other.id }),
    });
    expect(res.status).toBe(400);
  });

  it("creates a participant row when the player has none yet", async () => {
    const { admin, day } = await setup();
    const outsider = await prisma.player.create({
      data: { name: "O", email: "o@x", passwordHash: "x" },
    });
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await PATCH(req(day.id, outsider.id, { status: "confirmed" }), {
      params: Promise.resolve({ id: day.id, playerId: outsider.id }),
    });
    expect(res.status).toBe(200);
    const p = await prisma.gameDayParticipant.findUniqueOrThrow({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: outsider.id } },
    });
    expect(p.attendance).toBe("confirmed");
  });

  it("returns 404 when the player does not exist or is soft-deleted", async () => {
    const { admin, other, day } = await setup();
    await prisma.player.update({
      where: { id: other.id },
      data: { deletedAt: new Date() },
    });
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await PATCH(req(day.id, other.id, { status: "confirmed" }), {
      params: Promise.resolve({ id: day.id, playerId: other.id }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when the roster is already locked", async () => {
    const { admin, other, day } = await setup();
    await prisma.gameDay.update({
      where: { id: day.id },
      data: { status: "roster_locked" },
    });
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await PATCH(req(day.id, other.id, { status: "confirmed" }), {
      params: Promise.resolve({ id: day.id, playerId: other.id }),
    });
    expect(res.status).toBe(409);
  });
});
