import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { PUT } from "@/app/api/matches/[id]/route";
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

// We construct a gameDay directly in the planned status with a hand-
// rolled match row so we can hit the API without going through the
// real start-game-day flow (which would push it to in_progress).
async function setup() {
  const group = await createTestGroup();
  const season = await createTestSeason(group.id);
  const players = [];
  for (const i of [1, 2, 3, 4]) {
    players.push(
      await createMember(group.id, {
        name: `P${i}`,
        email: `p${i}@x`,
        passwordHash: "x",
        role: i === 1 ? "owner" : "member",
      }),
    );
  }
  const gameDay = await createTestGameDay(group.id, season.id, {
    date: new Date("2026-04-21"),
    status: "planned",
    playerCount: 4,
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
  return { group, gameDay, match, players };
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

const SCORE = { team1Score: 12, team2Score: 8, expectedVersion: 0 };

describe("PUT /api/matches/[id]", () => {
  beforeEach(async () => {
    authMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await resetDb();
  });

  it("returns 409 game_day_not_started when the day is still planned", async () => {
    const { group, match, players } = await setup();
    authMock.mockResolvedValue(sessionFor(players[0], group.id, "owner"));
    const res = await PUT(req(match.id, SCORE), ctx(match.id));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("game_day_not_started");
  });

  it("returns 401 when unauthenticated", async () => {
    const { match } = await setup();
    authMock.mockResolvedValue(null);
    const res = await PUT(req(match.id, SCORE), ctx(match.id));
    expect(res.status).toBe(401);
  });

  it("returns 403 without a group", async () => {
    const { match, players } = await setup();
    authMock.mockResolvedValue(sessionFor(players[0], null, null));
    const res = await PUT(req(match.id, SCORE), ctx(match.id));
    expect(res.status).toBe(403);
  });

  it("returns 404 for a match of another group", async () => {
    const { match } = await setup();
    const other = await createTestGroup("Andere");
    const outsider = await createMember(other.id, {
      name: "Out",
      email: "out@x",
      passwordHash: "x",
      role: "owner",
    });
    authMock.mockResolvedValue(sessionFor(outsider, other.id, "owner"));
    const res = await PUT(req(match.id, SCORE), ctx(match.id));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
