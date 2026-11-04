import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { loadPlayerDetail } from "@/lib/admin/player-detail";
import { resetDb } from "../helpers/reset-db";
import {
  createMember,
  createTestGameDay,
  createTestGroup,
  createTestSeason,
} from "../helpers/group";

let groupId: string;
let seasonId: string;

describe("loadPlayerDetail", () => {
  beforeEach(async () => {
    await resetDb();
    groupId = (await createTestGroup("Runde")).id;
    seasonId = (await createTestSeason(groupId)).id;
  });

  it("returns null for unknown ids", async () => {
    expect(await loadPlayerDetail(groupId, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("returns null for players of another group", async () => {
    const other = await createTestGroup("Andere");
    const p = await createMember(other.id, { name: "Fremd", email: "f@x.de" });
    expect(await loadPlayerDetail(groupId, p.id)).toBeNull();
  });

  it("returns null for removed members", async () => {
    const p = await createMember(groupId, { name: "Weg", email: "w@x.de" });
    await prisma.membership.updateMany({
      where: { playerId: p.id },
      data: { removedAt: new Date() },
    });
    expect(await loadPlayerDetail(groupId, p.id)).toBeNull();
  });

  it("takes joinedAt from the membership and has no PPG without matches", async () => {
    const p = await createMember(groupId, { name: "Neu", email: "n@x.de", passwordHash: "x" });
    const joinedAt = new Date(Date.UTC(2026, 2, 5));
    await prisma.membership.updateMany({ where: { playerId: p.id }, data: { joinedAt } });
    const d = await loadPlayerDetail(groupId, p.id);
    expect(d).toMatchObject({
      id: p.id,
      name: "Neu",
      email: "n@x.de",
      role: "member",
      hasPassword: true,
      emailVerified: false,
      seasonGold: 0,
      seasonPpg: null,
    });
    expect(d?.joinedAt).toEqual(joinedAt);
  });

  it("counts gold medals and points per match of the active season", async () => {
    const [a, b, c, d] = [
      await createMember(groupId, { name: "Anna", email: "a@x.de" }),
      await createMember(groupId, { name: "Ben", email: "b@x.de" }),
      await createMember(groupId, { name: "Cem", email: "c@x.de" }),
      await createMember(groupId, { name: "Dora", email: "d@x.de" }),
    ];
    const gd = await createTestGameDay(groupId, seasonId, {
      date: new Date(Date.UTC(2026, 5, 1)),
      status: "finished",
    });
    await prisma.match.create({
      data: {
        gameDayId: gd.id,
        matchNumber: 1,
        team1PlayerAId: a.id,
        team1PlayerBId: b.id,
        team2PlayerAId: c.id,
        team2PlayerBId: d.id,
        team1Score: 6,
        team2Score: 2,
      },
    });
    const detail = await loadPlayerDetail(groupId, a.id);
    expect(detail?.seasonGold).toBe(1);
    expect(detail?.seasonPpg).toBe(6);
    expect((await loadPlayerDetail(groupId, c.id))?.seasonPpg).toBe(2);
  });
});
