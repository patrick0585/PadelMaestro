import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { loadAdminOverview } from "@/lib/admin/overview";
import { resetDb } from "../helpers/reset-db";
import {
  createMember,
  createTestGameDay,
  createTestGroup,
  createTestSeason,
} from "../helpers/group";

let groupId: string;
let seasonId: string;

const day = (n: number) => new Date(Date.UTC(2026, 5, n));

async function member(name: string) {
  return createMember(groupId, { name, email: `${name.toLowerCase()}@x.de` });
}

describe("loadAdminOverview", () => {
  beforeEach(async () => {
    await resetDb();
    groupId = (await createTestGroup("Runde")).id;
    seasonId = (await createTestSeason(groupId)).id;
  });

  it("has no hero without game days", async () => {
    const o = await loadAdminOverview(groupId);
    expect(o.hero).toEqual({ kind: "none" });
    expect(o.groupName).toBe("Runde");
  });

  it("picks the earliest planned day and counts attendance of active members", async () => {
    const [a, b, c, d] = [await member("A"), await member("B"), await member("C"), await member("D")];
    await createTestGameDay(groupId, seasonId, { date: day(20) });
    const early = await createTestGameDay(groupId, seasonId, { date: day(10) });
    await prisma.gameDayParticipant.createMany({
      data: [
        { gameDayId: early.id, playerId: a.id, attendance: "confirmed" },
        { gameDayId: early.id, playerId: b.id, attendance: "confirmed" },
        { gameDayId: early.id, playerId: c.id, attendance: "declined" },
      ],
    });
    void d;
    const o = await loadAdminOverview(groupId);
    expect(o.hero).toMatchObject({ kind: "planned", id: early.id, confirmed: 2, total: 4, pending: 1 });
    expect(o.plannedCount).toBe(2);
  });

  it("counts planned days group-wide, even from an older season", async () => {
    const old = await createTestSeason(groupId, { isActive: false });
    await createTestGameDay(groupId, old.id, { date: day(5) });
    await createTestGameDay(groupId, seasonId, { date: day(6) });
    const o = await loadAdminOverview(groupId);
    expect(o.plannedCount).toBe(2);
  });

  it("prefers a running day over a planned one", async () => {
    await createTestGameDay(groupId, seasonId, { date: day(10) });
    const running = await createTestGameDay(groupId, seasonId, {
      date: day(12),
      status: "in_progress",
    });
    const o = await loadAdminOverview(groupId);
    expect(o.hero).toMatchObject({ kind: "running", id: running.id });
  });

  it("ignores removed memberships", async () => {
    await member("A");
    const b = await member("B");
    await prisma.membership.updateMany({
      where: { playerId: b.id },
      data: { removedAt: new Date() },
    });
    expect((await loadAdminOverview(groupId)).memberCount).toBe(1);
  });

  it("counts only open invitations of the group", async () => {
    const other = await createTestGroup("Andere");
    const future = new Date(Date.now() + 86_400_000);
    const mk = (g: string, h: string, extra: object = {}) =>
      prisma.invitation.create({
        data: { kind: "member", groupId: g, tokenHash: h, expiresAt: future, ...extra },
      });
    await mk(groupId, "h1");
    await mk(groupId, "h2");
    await mk(groupId, "h3", { revokedAt: new Date() });
    await mk(groupId, "h4", { expiresAt: new Date(Date.now() - 1000) });
    await mk(groupId, "h5", { usedCount: 1, maxUses: 1 });
    await mk(other.id, "h6");
    expect((await loadAdminOverview(groupId)).openInvitationCount).toBe(2);
  });
});
