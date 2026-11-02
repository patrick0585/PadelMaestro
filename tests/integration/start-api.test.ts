import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { POST } from "@/app/api/game-days/[id]/start/route";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup, sessionFor, setupGroupWithAdmin } from "../helpers/group";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function setup() {
  const { group, admin, session } = await setupGroupWithAdmin();
  const members = [];
  for (let i = 1; i <= 3; i++) {
    members.push(
      await createMember(group.id, { name: `M${i}`, email: `m${i}@x`, passwordHash: "x" }),
    );
  }
  const day = await createGameDay(group.id, new Date("2026-04-21"), admin.id);
  await prisma.gameDayParticipant.updateMany({
    where: { gameDayId: day.id },
    data: { attendance: "confirmed" },
  });
  return { group, admin, members, day, session };
}

async function call(id: string) {
  return POST(new Request(`http://localhost/api/game-days/${id}/start`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

describe("POST /api/game-days/[id]/start", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns 401 when unauthenticated", async () => {
    const { day } = await setup();
    authMock.mockResolvedValue(null);
    const res = await call(day.id);
    expect(res.status).toBe(401);
  });

  it("returns 403 for member role", async () => {
    const { group, members, day } = await setup();
    authMock.mockResolvedValue(sessionFor(members[0], group.id, "member"));
    const res = await call(day.id);
    expect(res.status).toBe(403);
  });

  it("returns 404 für Spieltag einer anderen Gruppe and leaves it planned", async () => {
    const { day } = await setup();
    const otherGroup = await createTestGroup("Andere");
    const otherAdmin = await createMember(otherGroup.id, {
      name: "Other",
      email: "other@example.com",
      role: "owner",
      passwordHash: "x",
    });
    authMock.mockResolvedValue(sessionFor(otherAdmin, otherGroup.id, "owner"));
    const res = await call(day.id);
    expect(res.status).toBe(404);
    const after = await prisma.gameDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(after.status).toBe("planned");
    expect(await prisma.match.count({ where: { gameDayId: day.id } })).toBe(0);
  });

  it("returns 200 and starts the day for an admin with four confirmed members", async () => {
    const { day, session } = await setup();
    authMock.mockResolvedValue(session);
    const res = await call(day.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { gameDay: { status: string } };
    expect(body.gameDay.status).toBe("in_progress");
    const after = await prisma.gameDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(after.status).toBe("in_progress");
  });
});
