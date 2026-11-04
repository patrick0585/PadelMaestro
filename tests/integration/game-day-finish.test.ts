import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/game-days/[id]/finish/route";
import { __resetLiveBroadcastForTests, subscribeToGameDay } from "@/lib/game-day/live-broadcast";
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

async function setup(status: "planned" | "in_progress" | "finished") {
  const { group, admin, session } = await setupGroupWithAdmin();
  const season = await createTestSeason(group.id);
  const day = await createTestGameDay(group.id, season.id, {
    date: new Date("2026-04-21"),
    status,
  });
  authMock.mockResolvedValue(session);
  return { group, admin, day };
}

function postReq(id: string) {
  return new Request(`http://localhost/api/game-days/${id}/finish`, { method: "POST" });
}
async function call(id: string) {
  return POST(postReq(id), { params: Promise.resolve({ id }) });
}

describe("POST /api/game-days/[id]/finish", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns 204 and flips in_progress to finished", async () => {
    const { day } = await setup("in_progress");
    const res = await call(day.id);
    expect(res.status).toBe(204);
    const after = await prisma.gameDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(after.status).toBe("finished");
  });

  it("publishes a live update so open game-day tabs refresh to the finished state", async () => {
    __resetLiveBroadcastForTests();
    const { day } = await setup("in_progress");
    let calls = 0;
    const off = subscribeToGameDay(day.id, () => {
      calls++;
    });
    const res = await call(day.id);
    expect(res.status).toBe(204);
    expect(calls).toBe(1);
    off();
  });

  it("returns 409 when already finished", async () => {
    const { day } = await setup("finished");
    const res = await call(day.id);
    expect(res.status).toBe(409);
  });

  it("returns 409 when planned", async () => {
    const { day } = await setup("planned");
    const res = await call(day.id);
    expect(res.status).toBe(409);
  });

  it("returns 401 when unauthenticated", async () => {
    const { day } = await setup("in_progress");
    authMock.mockResolvedValue(null);
    const res = await call(day.id);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    const { group, day } = await setup("in_progress");
    const user = await createMember(group.id, { name: "U", email: "u@example.com", passwordHash: "x" });
    authMock.mockResolvedValue(sessionFor(user, group.id, "member"));
    const res = await call(day.id);
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown id", async () => {
    await setup("in_progress");
    const res = await call("00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("returns 404 für Spieltag einer anderen Gruppe and leaves its status unchanged", async () => {
    const { day } = await setup("in_progress");
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
    expect(after.status).toBe("in_progress");
  });
});
