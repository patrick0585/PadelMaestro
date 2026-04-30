import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { PUT } from "@/app/api/matches/[id]/route";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

// We construct a gameDay directly in the planned status with a hand-
// rolled match row so we can hit the API without going through the
// real start-game-day flow (which would push it to in_progress).
async function setup() {
  const year = new Date().getFullYear();
  const season = await prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
  const players = await Promise.all(
    [1, 2, 3, 4].map((i) =>
      prisma.player.create({
        data: { name: `P${i}`, email: `p${i}@x`, passwordHash: "x", isAdmin: i === 1 },
      }),
    ),
  );
  const gameDay = await prisma.gameDay.create({
    data: {
      seasonId: season.id,
      date: new Date("2026-04-21"),
      status: "planned",
      playerCount: 4,
    },
  });
  for (const p of players) {
    await prisma.gameDayParticipant.create({
      data: { gameDayId: gameDay.id, playerId: p.id, attendance: "confirmed" },
    });
  }
  const match = await prisma.match.create({
    data: {
      gameDayId: gameDay.id,
      matchNumber: 1,
      team1PlayerAId: players[0].id,
      team1PlayerBId: players[1].id,
      team2PlayerAId: players[2].id,
      team2PlayerBId: players[3].id,
    },
  });
  return { gameDay, match, players };
}

function req(matchId: string, body: unknown) {
  return new Request(`http://localhost/api/matches/${matchId}`, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PUT /api/matches/[id]", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns 409 game_day_not_started when the day is still planned", async () => {
    const { match, players } = await setup();
    authMock.mockResolvedValue({
      user: { id: players[0].id, isAdmin: true, email: players[0].email, name: players[0].name },
    });
    const res = await PUT(
      req(match.id, { team1Score: 12, team2Score: 8, expectedVersion: 0 }),
      ctx(match.id),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("game_day_not_started");
  });
});
