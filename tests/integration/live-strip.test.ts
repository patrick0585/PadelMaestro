import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { loadLiveStrip } from "@/lib/game-day/live-strip";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";

async function setup(status: "planned" | "in_progress" | "finished", scores: [number | null, number | null][]) {
  const group = await createTestGroup();
  const year = new Date().getFullYear();
  const season = await prisma.season.create({
    data: { groupId: group.id, name: `Saison ${year}`, year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
  const ps = await Promise.all(["A", "B", "C", "D"].map((n) => createMember(group.id, { name: n, email: `${n}@x`, passwordHash: "x" })));
  const day = await prisma.gameDay.create({ data: { groupId: group.id, seasonId: season.id, date: new Date(), playerCount: 4, status } });
  for (const [i, [a, b]] of scores.entries()) {
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: i + 1,
        team1PlayerAId: ps[0].id,
        team1PlayerBId: ps[1].id,
        team2PlayerAId: ps[2].id,
        team2PlayerBId: ps[3].id,
        team1Score: a,
        team2Score: b,
      },
    });
  }
  return group.id;
}

describe("loadLiveStrip", () => {
  beforeEach(resetDb);

  it("nennt das erste offene Match und die Gesamtzahl", async () => {
    const groupId = await setup("in_progress", [[2, 1], [null, null], [null, null]]);
    expect(await loadLiveStrip(groupId)).toEqual({ current: 2, total: 3 });
  });

  it("current ist null, wenn alles gewertet ist", async () => {
    const groupId = await setup("in_progress", [[2, 1], [0, 3]]);
    expect(await loadLiveStrip(groupId)).toEqual({ current: null, total: 2 });
  });

  it.each(["planned", "finished"] as const)("ohne laufenden Spieltag (%s) null", async (status) => {
    expect(await loadLiveStrip(await setup(status, [[2, 1]]))).toBeNull();
  });

  it("ohne aktive Gruppe null", async () => {
    expect(await loadLiveStrip(null)).toBeNull();
  });
});
