import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/game-days/[id]/matches/route";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { startGameDay } from "@/lib/game-day/start";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function setupFive() {
  const players = [];
  for (let i = 1; i <= 5; i++) {
    players.push(
      await prisma.player.create({
        data: { name: `P${i}`, email: `p${i}@example.com`, passwordHash: "x", isAdmin: i === 1 },
      }),
    );
  }
  const day = await createGameDay(new Date("2026-04-21"), players[0].id);
  for (const p of players) await setAttendance(day.id, p.id, "confirmed");
  await startGameDay(day.id, players[0].id);
  return { players, day };
}

function postReq(id: string) {
  return new Request(`http://localhost/api/game-days/${id}/matches`, { method: "POST" });
}
async function call(id: string) {
  return POST(postReq(id), { params: Promise.resolve({ id }) });
}

describe("POST /api/game-days/[id]/matches", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("creates match #16 in in_progress", async () => {
    const { players, day } = await setupFive();
    authMock.mockResolvedValue({
      user: { id: players[0].id, isAdmin: true, email: players[0].email, name: players[0].name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { match: { matchNumber: number } };
    expect(body.match.matchNumber).toBe(16);
  });

  it("returns 409 in planned", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    const day = await createGameDay(new Date("2026-04-21"), admin.id);
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(409);
  });

  it("returns 409 in finished", async () => {
    const { players, day } = await setupFive();
    await prisma.gameDay.update({ where: { id: day.id }, data: { status: "finished" } });
    authMock.mockResolvedValue({
      user: { id: players[0].id, isAdmin: true, email: players[0].email, name: players[0].name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(409);
  });

  it("allows a confirmed non-admin participant to add an extra match", async () => {
    const { players, day } = await setupFive();
    authMock.mockResolvedValue({
      user: { id: players[1].id, isAdmin: false, email: players[1].email, name: players[1].name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { match: { matchNumber: number } };
    expect(body.match.matchNumber).toBe(16);
  });

  it("allows a joker non-admin participant to add an extra match", async () => {
    const { players, day } = await setupFive();
    // Add a sixth confirmed player so flipping players[2] to joker still
    // leaves 5 confirmed players — keeps the test focused on the auth gate
    // rather than bumping into addExtraMatch's "< 4 confirmed" guard.
    const sixth = await prisma.player.create({
      data: { name: "P6", email: "p6@example.com", passwordHash: "x" },
    });
    await prisma.gameDayParticipant.create({
      data: { gameDayId: day.id, playerId: sixth.id, attendance: "confirmed" },
    });
    await prisma.gameDayParticipant.update({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: players[2].id } },
      data: { attendance: "joker" },
    });
    authMock.mockResolvedValue({
      user: { id: players[2].id, isAdmin: false, email: players[2].email, name: players[2].name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(201);
  });

  it("returns 403 for a soft-deleted player whose participant row still exists", async () => {
    const { players, day } = await setupFive();
    await prisma.player.update({
      where: { id: players[1].id },
      data: { deletedAt: new Date() },
    });
    authMock.mockResolvedValue({
      user: { id: players[1].id, isAdmin: false, email: players[1].email, name: players[1].name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(403);
  });

  it("returns 403 for a non-admin player whose attendance is not confirmed/joker", async () => {
    const { players, day } = await setupFive();
    await prisma.gameDayParticipant.update({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: players[3].id } },
      data: { attendance: "declined" },
    });
    authMock.mockResolvedValue({
      user: { id: players[3].id, isAdmin: false, email: players[3].email, name: players[3].name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(403);
  });

  it("returns 403 for a logged-in user not on the roster at all", async () => {
    const { day } = await setupFive();
    const stranger = await prisma.player.create({
      data: { name: "Outsider", email: "out@x", passwordHash: "x" },
    });
    authMock.mockResolvedValue({
      user: { id: stranger.id, isAdmin: false, email: stranger.email, name: stranger.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(403);
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
});
