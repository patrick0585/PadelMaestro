import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { DELETE } from "@/app/api/game-days/[id]/matches/[matchId]/route";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { startGameDay } from "@/lib/game-day/start";
import { addExtraMatch } from "@/lib/game-day/add-extra-match";
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
  const day = await createGameDay(new Date("2026-06-09"), players[0].id);
  for (const p of players) await setAttendance(day.id, p.id, "confirmed");
  await startGameDay(day.id, players[0].id);
  return { players, day };
}

function delReq(id: string, matchId: string) {
  return new Request(`http://localhost/api/game-days/${id}/matches/${matchId}`, {
    method: "DELETE",
  });
}
async function call(id: string, matchId: string) {
  return DELETE(delReq(id, matchId), { params: Promise.resolve({ id, matchId }) });
}

function asUser(p: { id: string; email: string; name: string }, isAdmin: boolean) {
  authMock.mockResolvedValue({ user: { id: p.id, isAdmin, email: p.email, name: p.name } });
}

describe("DELETE /api/game-days/[id]/matches/[matchId]", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("lets an admin remove an extra match", async () => {
    const { players, day } = await setupFive();
    const extra = await addExtraMatch(day.id, players[0].id);
    asUser(players[0], true);

    const res = await call(day.id, extra.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await prisma.match.findUnique({ where: { id: extra.id } })).toBeNull();
  });

  it("returns 401 when unauthenticated", async () => {
    const { players, day } = await setupFive();
    const extra = await addExtraMatch(day.id, players[0].id);
    authMock.mockResolvedValue(null);

    const res = await call(day.id, extra.id);
    expect(res.status).toBe(401);
    expect(await prisma.match.findUnique({ where: { id: extra.id } })).not.toBeNull();
  });

  it("returns 403 for a non-admin participant", async () => {
    const { players, day } = await setupFive();
    const extra = await addExtraMatch(day.id, players[0].id);
    asUser(players[1], false);

    const res = await call(day.id, extra.id);
    expect(res.status).toBe(403);
    // Match untouched.
    expect(await prisma.match.findUnique({ where: { id: extra.id } })).not.toBeNull();
  });

  it("returns 422 when targeting a template match", async () => {
    const { players, day } = await setupFive();
    const template = await prisma.match.findFirstOrThrow({
      where: { gameDayId: day.id, matchNumber: 1 },
    });
    asUser(players[0], true);

    const res = await call(day.id, template.id);
    expect(res.status).toBe(422);
  });

  it("returns 404 for an unknown match id", async () => {
    const { players, day } = await setupFive();
    asUser(players[0], true);

    const res = await call(day.id, "00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("returns 409 when the game day is finished", async () => {
    const { players, day } = await setupFive();
    const extra = await addExtraMatch(day.id, players[0].id);
    await prisma.gameDay.update({ where: { id: day.id }, data: { status: "finished" } });
    asUser(players[0], true);

    const res = await call(day.id, extra.id);
    expect(res.status).toBe(409);
  });

  it("reopens the finish path: after removing the only unscored extra, every match is scored", async () => {
    const { players, day } = await setupFive();
    // Score all 15 template matches.
    const templates = await prisma.match.findMany({ where: { gameDayId: day.id } });
    for (const m of templates) {
      await prisma.match.update({
        where: { id: m.id },
        data: { team1Score: 3, team2Score: 0 },
      });
    }
    // Add an extra match and leave it unscored — this is what blocked finish.
    const extra = await addExtraMatch(day.id, players[0].id);
    asUser(players[0], true);

    const res = await call(day.id, extra.id);
    expect(res.status).toBe(200);

    const remaining = await prisma.match.findMany({ where: { gameDayId: day.id } });
    expect(remaining).toHaveLength(15);
    expect(remaining.every((m) => m.team1Score !== null && m.team2Score !== null)).toBe(true);
  });
});
