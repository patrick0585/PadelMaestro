import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/game-days/[id]/shuffle-preview/route";
import { resetDb } from "../helpers/reset-db";
import {
  createMember,
  createTestGameDay,
  createTestGroup,
  createTestSeason,
  sessionFor,
  setupGroupWithAdmin,
} from "../helpers/group";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function setup() {
  const { group, admin, session } = await setupGroupWithAdmin();
  const season = await createTestSeason(group.id);
  const member = await createMember(group.id, { name: "Mem", email: "mem@x", passwordHash: "x" });
  const gameDay = await createTestGameDay(group.id, season.id, {
    date: new Date("2026-04-21"),
    status: "planned",
  });
  return { group, season, admin, member, gameDay, session };
}

function req(gameDayId: string) {
  return new Request(`http://localhost/api/game-days/${gameDayId}/shuffle-preview`, {
    method: "POST",
  });
}
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/game-days/[id]/shuffle-preview", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns 401 when unauthenticated", async () => {
    const { gameDay } = await setup();
    authMock.mockResolvedValue(null);
    const res = await POST(req(gameDay.id), ctx(gameDay.id));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin caller", async () => {
    const { group, gameDay, member } = await setup();
    authMock.mockResolvedValue(sessionFor(member, group.id, "member"));
    const res = await POST(req(gameDay.id), ctx(gameDay.id));
    expect(res.status).toBe(403);
  });

  it("returns 200 with a fresh seed for an admin on a planned day", async () => {
    const { gameDay, session } = await setup();
    authMock.mockResolvedValue(session);
    const res = await POST(req(gameDay.id), ctx(gameDay.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { seed: string };
    expect(body.seed).toBeTruthy();

    const after = await prisma.gameDay.findUniqueOrThrow({ where: { id: gameDay.id } });
    expect(after.seed).toBe(body.seed);
  });

  it("returns 404 für Spieltag einer anderen Gruppe and leaves the seed unchanged", async () => {
    const { gameDay } = await setup();
    const otherGroup = await createTestGroup("Andere");
    const otherAdmin = await createMember(otherGroup.id, {
      name: "Other",
      email: "other@example.com",
      role: "owner",
      passwordHash: "x",
    });
    authMock.mockResolvedValue(sessionFor(otherAdmin, otherGroup.id, "owner"));
    const res = await POST(req(gameDay.id), ctx(gameDay.id));
    expect(res.status).toBe(404);
    const after = await prisma.gameDay.findUniqueOrThrow({ where: { id: gameDay.id } });
    expect(after.seed).toBe(gameDay.seed);
  });

  it("returns 409 not_planned once the day is in_progress", async () => {
    const { gameDay, session } = await setup();
    await prisma.gameDay.update({
      where: { id: gameDay.id },
      data: { status: "in_progress" },
    });
    authMock.mockResolvedValue(session);
    const res = await POST(req(gameDay.id), ctx(gameDay.id));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("not_planned");
  });
});
