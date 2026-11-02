import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/game-days/[id]/matches/route";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { startGameDay } from "@/lib/game-day/start";
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

async function setupFive() {
  const group = await createTestGroup();
  const players = [];
  for (let i = 1; i <= 5; i++) {
    players.push(
      await createMember(group.id, {
        name: `P${i}`,
        email: `p${i}@example.com`,
        passwordHash: "x",
        role: i === 1 ? "owner" : "member",
      }),
    );
  }
  const day = await createGameDay(group.id, new Date("2026-04-21"), players[0].id);
  for (const p of players) await setAttendance(day.id, p.id, "confirmed");
  await startGameDay(day.id, players[0].id);
  return { group, players, day };
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
    const { group, players, day } = await setupFive();
    authMock.mockResolvedValue(sessionFor(players[0], group.id, "owner"));
    const res = await call(day.id);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { match: { matchNumber: number } };
    expect(body.match.matchNumber).toBe(16);
  });

  it("returns 409 in planned", async () => {
    const group = await createTestGroup();
    const admin = await createMember(group.id, {
      name: "A",
      email: "a@example.com",
      passwordHash: "x",
      role: "owner",
    });
    const day = await createGameDay(group.id, new Date("2026-04-21"), admin.id);
    authMock.mockResolvedValue(sessionFor(admin, group.id, "owner"));
    const res = await call(day.id);
    expect(res.status).toBe(409);
  });

  it("returns 409 in finished", async () => {
    const { group, players, day } = await setupFive();
    await prisma.gameDay.update({ where: { id: day.id }, data: { status: "finished" } });
    authMock.mockResolvedValue(sessionFor(players[0], group.id, "owner"));
    const res = await call(day.id);
    expect(res.status).toBe(409);
  });

  it("allows a confirmed non-admin participant to add an extra match", async () => {
    const { group, players, day } = await setupFive();
    authMock.mockResolvedValue(sessionFor(players[1], group.id, "member"));
    const res = await call(day.id);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { match: { matchNumber: number } };
    expect(body.match.matchNumber).toBe(16);
  });

  it("allows a joker non-admin participant to add an extra match", async () => {
    const { group, players, day } = await setupFive();
    // Add a sixth confirmed player so flipping players[2] to joker still
    // leaves 5 confirmed players — keeps the test focused on the auth gate
    // rather than bumping into addExtraMatch's "< 4 confirmed" guard.
    const sixth = await createMember(group.id, {
      name: "P6",
      email: "p6@example.com",
      passwordHash: "x",
    });
    await prisma.gameDayParticipant.create({
      data: { gameDayId: day.id, playerId: sixth.id, attendance: "confirmed" },
    });
    await prisma.gameDayParticipant.update({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: players[2].id } },
      data: { attendance: "joker" },
    });
    authMock.mockResolvedValue(sessionFor(players[2], group.id, "member"));
    const res = await call(day.id);
    expect(res.status).toBe(201);
  });

  it("returns 403 for a soft-deleted player whose participant row still exists", async () => {
    const { group, players, day } = await setupFive();
    await prisma.player.update({
      where: { id: players[1].id },
      data: { deletedAt: new Date() },
    });
    authMock.mockResolvedValue(sessionFor(players[1], group.id, "member"));
    const res = await call(day.id);
    expect(res.status).toBe(403);
  });

  it("returns 403 for a non-admin player whose attendance is not confirmed/joker", async () => {
    const { group, players, day } = await setupFive();
    await prisma.gameDayParticipant.update({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: players[3].id } },
      data: { attendance: "declined" },
    });
    authMock.mockResolvedValue(sessionFor(players[3], group.id, "member"));
    const res = await call(day.id);
    expect(res.status).toBe(403);
  });

  it("returns 403 for a logged-in group member not on the roster at all", async () => {
    const { group, day } = await setupFive();
    const stranger = await createMember(group.id, {
      name: "Outsider",
      email: "out@x",
      passwordHash: "x",
    });
    authMock.mockResolvedValue(sessionFor(stranger, group.id, "member"));
    const res = await call(day.id);
    expect(res.status).toBe(403);
  });

  it("returns 403 without a group", async () => {
    const { players, day } = await setupFive();
    authMock.mockResolvedValue(sessionFor(players[0], null, null));
    const res = await call(day.id);
    expect(res.status).toBe(403);
  });

  it("returns 404 for a game day of another group", async () => {
    const { group, players } = await setupFive();
    const other = await createTestGroup("Andere");
    const otherSeason = await createTestSeason(other.id);
    const otherDay = await createTestGameDay(other.id, otherSeason.id, { status: "in_progress" });
    authMock.mockResolvedValue(sessionFor(players[0], group.id, "owner"));
    const res = await call(otherDay.id);
    expect(res.status).toBe(404);
    expect(await prisma.match.count({ where: { gameDayId: otherDay.id } })).toBe(0);
  });

  it("returns 404 for unknown id", async () => {
    const group = await createTestGroup();
    const admin = await createMember(group.id, {
      name: "A",
      email: "a@example.com",
      passwordHash: "x",
      role: "owner",
    });
    authMock.mockResolvedValue(sessionFor(admin, group.id, "owner"));
    const res = await call("00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});
