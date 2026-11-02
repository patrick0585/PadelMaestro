// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GET } from "@/app/api/game-day/[id]/events/route";
import { getActiveSubscriberCount, __resetLiveBroadcastForTests } from "@/lib/game-day/live-broadcast";
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

function call(id: string, signal?: AbortSignal) {
  return GET(new Request(`http://localhost/api/game-day/${id}/events`, { signal }), {
    params: Promise.resolve({ id }),
  });
}

async function setupTwoGroups() {
  const groupA = await createTestGroup("A");
  const groupB = await createTestGroup("B");
  const memberA = await createMember(groupA.id, { name: "Anna", email: "a@example.com" });
  const seasonA = await createTestSeason(groupA.id);
  const seasonB = await createTestSeason(groupB.id);
  const dayA = await createTestGameDay(groupA.id, seasonA.id);
  const dayB = await createTestGameDay(groupB.id, seasonB.id);
  return { groupA, memberA, dayA, dayB };
}

describe("GET /api/game-day/[id]/events", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });
  afterEach(() => {
    __resetLiveBroadcastForTests();
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null);
    const res = await call("any");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a session without a group", async () => {
    const { memberA, dayA } = await setupTwoGroups();
    authMock.mockResolvedValue(sessionFor(memberA, null, null));
    const res = await call(dayA.id);
    expect(res.status).toBe(403);
  });

  it("returns 404 for another group's day and does not subscribe", async () => {
    const { groupA, memberA, dayB } = await setupTwoGroups();
    authMock.mockResolvedValue(sessionFor(memberA, groupA.id, "member"));
    const res = await call(dayB.id);
    expect(res.status).toBe(404);
    expect(getActiveSubscriberCount(dayB.id)).toBe(0);
  });

  it("opens an event stream for the own group's day", async () => {
    const { groupA, memberA, dayA } = await setupTwoGroups();
    authMock.mockResolvedValue(sessionFor(memberA, groupA.id, "member"));
    const controller = new AbortController();
    const res = await call(dayA.id, controller.signal);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(getActiveSubscriberCount(dayA.id)).toBe(1);
    controller.abort();
    expect(getActiveSubscriberCount(dayA.id)).toBe(0);
  });

  it("cleans up when the reader cancels the stream", async () => {
    const { groupA, memberA, dayA } = await setupTwoGroups();
    authMock.mockResolvedValue(sessionFor(memberA, groupA.id, "member"));
    const res = await call(dayA.id);
    expect(getActiveSubscriberCount(dayA.id)).toBe(1);
    await res.body?.cancel();
    expect(getActiveSubscriberCount(dayA.id)).toBe(0);
  });
});
