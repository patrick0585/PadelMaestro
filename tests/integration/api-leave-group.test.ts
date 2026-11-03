import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGameDay, createTestGroup, createTestSeason, sessionFor } from "../helpers/group";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { POST } from "@/app/api/profile/leave-group/route";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

const req = (groupId: unknown) =>
  new Request("http://test/api/profile/leave-group", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ groupId }),
  });

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
});

describe("POST /api/profile/leave-group", () => {
  it("204 for a member, 409 codes as specified", async () => {
    const g = await createTestGroup("G");
    const owner = await createMember(g.id, { name: "O", email: "o@x.de", role: "owner" });
    const member = await createMember(g.id, { name: "M", email: "m@x.de" });
    const admin = await createMember(g.id, { name: "A", email: "a@x.de", role: "admin" });

    authMock.mockResolvedValue(null);
    expect((await POST(req(g.id))).status).toBe(401);
    authMock.mockResolvedValue(sessionFor(member, null, null));
    expect((await POST(req(g.id))).status).toBe(403);

    authMock.mockResolvedValue(sessionFor(member, g.id, "member"));
    const other = await createTestGroup("H");
    const stale = await POST(req(other.id));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "stale_group" });
    expect((await POST(req("nope"))).status).toBe(400);
    const still = await prisma.membership.findUniqueOrThrow({
      where: { groupId_playerId: { groupId: g.id, playerId: member.id } },
    });
    expect(still.removedAt).toBeNull();

    authMock.mockResolvedValue(sessionFor(owner, g.id, "owner"));
    const res = await POST(req(g.id));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "owner_protected" });

    // admin leaving while owner exists is fine; make admin last by removing owner
    await prisma.membership.update({
      where: { groupId_playerId: { groupId: g.id, playerId: owner.id } },
      data: { removedAt: new Date() },
    });
    authMock.mockResolvedValue(sessionFor(admin, g.id, "admin"));
    const r2 = await POST(req(g.id));
    expect(r2.status).toBe(409);
    expect(await r2.json()).toEqual({ error: "last_admin" });

    const season = await createTestSeason(g.id);
    const day = await createTestGameDay(g.id, season.id, { status: "planned" });
    await prisma.gameDayParticipant.create({
      data: { gameDayId: day.id, playerId: member.id, attendance: "joker" },
    });
    authMock.mockResolvedValue(sessionFor(member, g.id, "member"));
    const r3 = await POST(req(g.id));
    expect(r3.status).toBe(409);
    expect(await r3.json()).toEqual({ error: "active_participation" });

    await prisma.gameDayParticipant.deleteMany({});
    const ok = await POST(req(g.id));
    expect(ok.status).toBe(204);
    const m = await prisma.membership.findUniqueOrThrow({
      where: { groupId_playerId: { groupId: g.id, playerId: member.id } },
    });
    expect(m.removedAt).not.toBeNull();
  });
});
