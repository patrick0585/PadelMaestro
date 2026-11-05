import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { listAdminGameDays, loadPlannedGameDay } from "@/lib/admin/game-days";
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

async function match(
  gameDayId: string,
  t1: [string, string],
  t2: [string, string],
  s1: number,
  s2: number,
) {
  await prisma.match.create({
    data: {
      gameDayId,
      matchNumber: 1,
      team1PlayerAId: t1[0],
      team1PlayerBId: t1[1],
      team2PlayerAId: t2[0],
      team2PlayerBId: t2[1],
      team1Score: s1,
      team2Score: s2,
    },
  });
}

describe("listAdminGameDays", () => {
  beforeEach(async () => {
    await resetDb();
    groupId = (await createTestGroup("Runde")).id;
    seasonId = (await createTestSeason(groupId)).id;
  });

  it("orders open days running first, then planned ascending, with attendance", async () => {
    const [a, b] = [await member("A"), await member("B")];
    const late = await createTestGameDay(groupId, seasonId, { date: day(20) });
    const early = await createTestGameDay(groupId, seasonId, { date: day(10) });
    const running = await createTestGameDay(groupId, seasonId, {
      date: day(15),
      status: "in_progress",
    });
    await prisma.gameDayParticipant.create({
      data: { gameDayId: early.id, playerId: a.id, attendance: "confirmed" },
    });
    void b;
    const { open } = await listAdminGameDays(groupId);
    expect(open.map((d) => d.id)).toEqual([running.id, early.id, late.id]);
    expect(open[0].status).toBe("in_progress");
    expect(open[1]).toMatchObject({ status: "planned", confirmed: 1, total: 2 });
  });

  it("returns the last three finished days with winners, ties included", async () => {
    const [a, b, c, d] = [await member("Anna"), await member("Ben"), await member("Cem"), await member("Dora")];
    const days = [];
    for (const n of [1, 2, 3, 4]) {
      days.push(await createTestGameDay(groupId, seasonId, { date: day(n), status: "finished" }));
    }
    await match(days[0].id, [a.id, b.id], [c.id, d.id], 6, 2);
    await match(days[1].id, [a.id, b.id], [c.id, d.id], 6, 2);
    await match(days[2].id, [a.id, b.id], [c.id, d.id], 2, 6);
    await match(days[3].id, [a.id, b.id], [c.id, d.id], 5, 5);
    const { recent } = await listAdminGameDays(groupId);
    expect(recent.map((r) => r.id)).toEqual([days[3].id, days[2].id, days[1].id]);
    expect(recent[0].winners.sort()).toEqual(["Anna", "Ben", "Cem", "Dora"]);
    expect(recent[1].winners.sort()).toEqual(["Cem", "Dora"]);
    expect(recent[2].winners.sort()).toEqual(["Anna", "Ben"]);
    expect(recent[1]).toMatchObject({ winnerPoints: 6, playerCount: 4 });
  });

  it("ignores other groups", async () => {
    const other = await createTestGroup("Andere");
    const otherSeason = await createTestSeason(other.id);
    await createTestGameDay(other.id, otherSeason.id, { date: day(5) });
    const res = await listAdminGameDays(groupId);
    expect(res.open).toEqual([]);
    expect(res.recent).toEqual([]);
  });
});

describe("loadPlannedGameDay", () => {
  beforeEach(async () => {
    await resetDb();
    groupId = (await createTestGroup("Runde")).id;
    seasonId = (await createTestSeason(groupId)).id;
  });

  it("returns null for unknown ids and other groups", async () => {
    const other = await createTestGroup("Andere");
    const otherSeason = await createTestSeason(other.id);
    const foreign = await createTestGameDay(other.id, otherSeason.id, { date: day(5) });
    expect(await loadPlannedGameDay(groupId, foreign.id)).toBeNull();
    expect(await loadPlannedGameDay(groupId, "nope")).toBeNull();
  });

  it("redirects finished and running days", async () => {
    const fin = await createTestGameDay(groupId, seasonId, { date: day(1), status: "finished" });
    const run = await createTestGameDay(groupId, seasonId, { date: day(2), status: "in_progress" });
    expect(await loadPlannedGameDay(groupId, fin.id)).toEqual({
      kind: "redirect",
      to: `/archive/${fin.id}`,
    });
    expect(await loadPlannedGameDay(groupId, run.id)).toEqual({ kind: "redirect", to: "/game-day" });
  });

  it("builds the roster for a planned day", async () => {
    const a = await member("Zoe");
    await member("Abel");
    const planned = await createTestGameDay(groupId, seasonId, { date: day(9) });
    await prisma.gameDayParticipant.create({
      data: { gameDayId: planned.id, playerId: a.id, attendance: "confirmed" },
    });
    const res = await loadPlannedGameDay(groupId, planned.id);
    expect(res).toMatchObject({ kind: "planned", id: planned.id });
    if (res?.kind !== "planned") throw new Error("expected planned");
    expect(res.roster.map((r) => [r.name, r.attendance])).toEqual([
      ["Abel", "pending"],
      ["Zoe", "confirmed"],
    ]);
  });
});
