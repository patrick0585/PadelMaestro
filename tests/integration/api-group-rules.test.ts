import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import {
  createTestGroup,
  createMember,
  createTestSeason,
  createTestGameDay,
  sessionFor,
} from "../helpers/group";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { PATCH } from "@/app/api/groups/active/rules/route";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

const req = (body: Record<string, unknown>) =>
  new Request("http://test/api/groups/active/rules", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

async function setup() {
  const group = await createTestGroup("Padelfreunde");
  const admin = await createMember(group.id, { name: "Armin", email: "a@example.com", role: "admin" });
  const member = await createMember(group.id, { name: "Mia", email: "m@example.com" });
  return { group, admin, member };
}

async function addJokers(
  groupId: string,
  seasonId: string,
  playerId: string,
  count: number,
  dayOffset = 0,
) {
  for (let i = 0; i < count; i++) {
    const gameDay = await createTestGameDay(groupId, seasonId, {
      date: new Date(Date.UTC(2030, 0, 1 + dayOffset + i)),
    });
    await prisma.jokerUse.create({
      data: { playerId, seasonId, gameDayId: gameDay.id, ppgAtUse: 1, pointsCredited: 15 },
    });
  }
}

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
});

describe("PATCH /api/groups/active/rules", () => {
  it("401 without a session", async () => {
    const { group } = await setup();
    authMock.mockResolvedValue(null);
    const res = await PATCH(req({ groupId: group.id, jokersPerSeason: 3, jokerGamesCredited: 10 }));
    expect(res.status).toBe(401);
  });

  it("403 for a member, nothing changes", async () => {
    const { group, member } = await setup();
    authMock.mockResolvedValue(sessionFor(member, group.id, "member"));
    const res = await PATCH(req({ groupId: group.id, jokersPerSeason: 3, jokerGamesCredited: 10 }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    const g = await prisma.group.findUniqueOrThrow({ where: { id: group.id } });
    expect([g.jokersPerSeason, g.jokerGamesCredited]).toEqual([2, 15]);
  });

  it("200 for an admin, stores values and writes an audit entry", async () => {
    const { group, admin } = await setup();
    authMock.mockResolvedValue(sessionFor(admin, group.id, "admin"));
    const res = await PATCH(req({ groupId: group.id, jokersPerSeason: 4, jokerGamesCredited: 12 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jokersPerSeason: 4, jokerGamesCredited: 12 });
    const g = await prisma.group.findUniqueOrThrow({ where: { id: group.id } });
    expect([g.jokersPerSeason, g.jokerGamesCredited]).toEqual([4, 12]);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { groupId: group.id, action: "group.rules_update" },
    });
    expect(audit.actorId).toBe(admin.id);
    expect(audit.payload).toEqual({
      before: { jokersPerSeason: 2, jokerGamesCredited: 15 },
      after: { jokersPerSeason: 4, jokerGamesCredited: 12 },
    });
  });

  it("409 stale_group for a foreign groupId, no change", async () => {
    const { group, admin } = await setup();
    const other = await createTestGroup("Andere");
    authMock.mockResolvedValue(sessionFor(admin, group.id, "admin"));
    const res = await PATCH(req({ groupId: other.id, jokersPerSeason: 4, jokerGamesCredited: 12 }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "stale_group" });
    for (const id of [group.id, other.id]) {
      const g = await prisma.group.findUniqueOrThrow({ where: { id } });
      expect([g.jokersPerSeason, g.jokerGamesCredited]).toEqual([2, 15]);
    }
  });

  it.each([
    { jokersPerSeason: -1, jokerGamesCredited: 15 },
    { jokersPerSeason: 11, jokerGamesCredited: 15 },
    { jokersPerSeason: 2, jokerGamesCredited: 0 },
    { jokersPerSeason: 2, jokerGamesCredited: 31 },
    { jokersPerSeason: 2.5, jokerGamesCredited: 15 },
    { jokersPerSeason: 2, jokerGamesCredited: "15" },
    { jokersPerSeason: 2 },
  ])("400 invalid for %j", async (rules) => {
    const { group, admin } = await setup();
    authMock.mockResolvedValue(sessionFor(admin, group.id, "admin"));
    const res = await PATCH(req({ groupId: group.id, ...rules }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid" });
  });

  it("accepts the boundary values", async () => {
    const { group, admin } = await setup();
    authMock.mockResolvedValue(sessionFor(admin, group.id, "admin"));
    expect(
      (await PATCH(req({ groupId: group.id, jokersPerSeason: 0, jokerGamesCredited: 1 }))).status,
    ).toBe(200);
    expect(
      (await PATCH(req({ groupId: group.id, jokersPerSeason: 10, jokerGamesCredited: 30 }))).status,
    ).toBe(200);
  });

  it("floor: lowering to the used count is fine, below it is 409 below_used", async () => {
    const { group, admin, member } = await setup();
    const season = await createTestSeason(group.id);
    await addJokers(group.id, season.id, member.id, 2);
    authMock.mockResolvedValue(sessionFor(admin, group.id, "admin"));

    const below = await PATCH(req({ groupId: group.id, jokersPerSeason: 1, jokerGamesCredited: 15 }));
    expect(below.status).toBe(409);
    expect(await below.json()).toEqual({ error: "below_used", minimum: 2 });
    expect((await prisma.group.findUniqueOrThrow({ where: { id: group.id } })).jokersPerSeason).toBe(2);

    const ok = await PATCH(req({ groupId: group.id, jokersPerSeason: 2, jokerGamesCredited: 15 }));
    expect(ok.status).toBe(200);
    expect(await prisma.jokerUse.count()).toBe(2);
  });

  it("floor ignores removed members and inactive seasons", async () => {
    const { group, admin } = await setup();
    const removed = await createMember(group.id, { name: "Rolf", email: "r@example.com" });
    await prisma.membership.updateMany({
      where: { playerId: removed.id },
      data: { removedAt: new Date() },
    });
    const old = await createTestSeason(group.id, { isActive: false, year: 2029 });
    const season = await createTestSeason(group.id);
    await addJokers(group.id, season.id, removed.id, 3);
    await addJokers(group.id, old.id, admin.id, 2, 100);
    authMock.mockResolvedValue(sessionFor(admin, group.id, "admin"));
    const res = await PATCH(req({ groupId: group.id, jokersPerSeason: 0, jokerGamesCredited: 15 }));
    expect(res.status).toBe(200);
  });

  it("floor is 0 without an active season", async () => {
    const { group, admin } = await setup();
    authMock.mockResolvedValue(sessionFor(admin, group.id, "admin"));
    const res = await PATCH(req({ groupId: group.id, jokersPerSeason: 0, jokerGamesCredited: 15 }));
    expect(res.status).toBe(200);
  });
});
