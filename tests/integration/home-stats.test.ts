import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";
import { computeHomeSeasonStats, computePlayerSeasonStats } from "@/lib/player/season-stats";
import { computeRanking, computeStandings } from "@/lib/ranking/compute";

async function seed() {
  const group = await createTestGroup();
  const season = await prisma.season.create({
    data: { groupId: group.id, name: "Saison 2026", year: 2026, startDate: new Date(2026, 0, 1), endDate: new Date(2026, 11, 31), isActive: true },
  });
  const [me, a, b, c] = await Promise.all(
    ["Me", "A", "B", "C"].map((n) => createMember(group.id, { name: n, email: `${n.toLowerCase()}@x`, passwordHash: "x" })),
  );
  const days = [];
  for (const [i, date] of ["2026-04-10", "2026-04-17", "2026-04-24"].entries()) {
    const day = await prisma.gameDay.create({
      data: { groupId: group.id, seasonId: season.id, date: new Date(date), playerCount: 4, status: "finished" },
    });
    days.push(day);
    const scores: [number, number][] = [
      [3 + i, 1],
      [2, 3],
    ];
    const teams = [
      [me.id, a.id, b.id, c.id],
      [me.id, b.id, a.id, c.id],
    ];
    for (const [k, t] of teams.entries()) {
      await prisma.match.create({
        data: {
          gameDayId: day.id,
          matchNumber: k + 1,
          team1PlayerAId: t[0],
          team1PlayerBId: t[1],
          team2PlayerAId: t[2],
          team2PlayerBId: t[3],
          team1Score: scores[k][0],
          team2Score: scores[k][1],
        },
      });
    }
  }
  // a day the player missed, and an unfinished one: both count differently
  await prisma.gameDay.create({
    data: { groupId: group.id, seasonId: season.id, date: new Date("2026-05-01"), playerCount: 4, status: "finished" },
  });
  await prisma.jokerUse.create({
    data: { playerId: me.id, seasonId: season.id, gameDayId: days[0].id, ppgAtUse: 2, gamesCredited: 15, pointsCredited: 30 },
  });
  return { season, me };
}

describe("home loaders", () => {
  beforeEach(resetDb);
  afterEach(() => vi.restoreAllMocks());

  it("computeStandings is the ranking without medals", async () => {
    const { season } = await seed();
    const full = await computeRanking(season.id);
    const lean = await computeStandings(season.id);
    expect(lean).toEqual(full.map(({ medals: _medals, ...row }) => row));
    expect(lean.length).toBeGreaterThan(0);
  });

  it("computeHomeSeasonStats matches the fields the season card reads", async () => {
    const { season, me } = await seed();
    const full = await computePlayerSeasonStats(me.id, season.id);
    const lean = await computeHomeSeasonStats(me.id, season.id);
    expect(lean).toEqual({
      attendance: full.attendance,
      jokers: full.jokers,
      winRate: { wins: full.winRate.wins, matches: full.winRate.matches },
      recentPpg: full.recentDays.map((d) => d.ppg),
    });
    expect(lean.attendance).toEqual({ attended: 3, total: 4 });
    expect(lean.recentPpg).toHaveLength(3);
  });

  it("empty player: zero stats", async () => {
    const { season } = await seed();
    const stranger = await createMember(season.groupId, { name: "Neu", email: "neu@x", passwordHash: "x" });
    const lean = await computeHomeSeasonStats(stranger.id, season.id);
    expect(lean).toEqual({
      attendance: { attended: 0, total: 4 },
      winRate: { wins: 0, matches: 0 },
      recentPpg: [],
      jokers: { used: 0, remaining: 2, total: 2 },
    });
  });

  it("the lean loaders build no per-day summaries; the full ones do", async () => {
    const { season, me } = await seed();
    const summaryQuery = vi.spyOn(prisma.gameDay, "findUnique");

    await computeStandings(season.id);
    await computeHomeSeasonStats(me.id, season.id);
    expect(summaryQuery).not.toHaveBeenCalled();

    await computeRanking(season.id);
    await computePlayerSeasonStats(me.id, season.id);
    expect(summaryQuery).toHaveBeenCalled();
  });
});
