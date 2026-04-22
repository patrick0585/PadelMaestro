import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/game-days/[id]/matches/route";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { lockRoster } from "@/lib/game-day/lock";
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
  await lockRoster(day.id, players[0].id);
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

  it("creates match #16 in roster_locked", async () => {
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

  it("returns 403 for non-admin", async () => {
    const { players, day } = await setupFive();
    authMock.mockResolvedValue({
      user: { id: players[1].id, isAdmin: false, email: players[1].email, name: players[1].name },
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
