import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { computePlayerSeasonStats } from "@/lib/player/season-stats";

async function makeSeason() {
  const year = 2026;
  return prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
}
async function makePlayer(name: string) {
  return prisma.player.create({
    data: { name, email: `${name.toLowerCase()}@x`, passwordHash: "x" },
  });
}

describe("computePlayerSeasonStats", () => {
  beforeEach(resetDb);

  it("returns empty stats when the player has no activity", async () => {
    const season = await makeSeason();
    const me = await makePlayer("Me");
    const stats = await computePlayerSeasonStats(me.id, season.id);
    expect(stats).toEqual({
      medals: { gold: 0, silver: 0, bronze: 0 },
      attendance: { attended: 0, total: 0 },
      winRate: { wins: 0, losses: 0, draws: 0, matches: 0 },
      recentForm: [],
      bestPartner: null,
      worstPartner: null,
      jokers: { used: 0, remaining: 2, total: 2 },
    });
  });

  it("counts medals from finished game days in the season only", async () => {
    const season = await makeSeason();
    const otherSeason = await prisma.season.create({
      data: { year: 2025, startDate: new Date(2025, 0, 1), endDate: new Date(2025, 11, 31), isActive: false },
    });
    const [me, a, b, c] = await Promise.all(["Me", "A", "B", "C"].map(makePlayer));
    const day1 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day1.id, matchNumber: 1,
        team1PlayerAId: me.id, team1PlayerBId: a.id,
        team2PlayerAId: b.id, team2PlayerBId: c.id,
        team1Score: 3, team2Score: 0,
      },
    });
    await prisma.match.create({
      data: {
        gameDayId: day1.id, matchNumber: 2,
        team1PlayerAId: me.id, team1PlayerBId: b.id,
        team2PlayerAId: a.id, team2PlayerBId: c.id,
        team1Score: 3, team2Score: 0,
      },
    });
    const day2 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-17"), playerCount: 4, status: "in_progress" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day2.id, matchNumber: 1,
        team1PlayerAId: me.id, team1PlayerBId: a.id,
        team2PlayerAId: b.id, team2PlayerBId: c.id,
        team1Score: 5, team2Score: 0,
      },
    });
    const dayOtherSeason = await prisma.gameDay.create({
      data: { seasonId: otherSeason.id, date: new Date("2025-12-12"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: dayOtherSeason.id, matchNumber: 1,
        team1PlayerAId: me.id, team1PlayerBId: a.id,
        team2PlayerAId: b.id, team2PlayerBId: c.id,
        team1Score: 9, team2Score: 0,
      },
    });
    const stats = await computePlayerSeasonStats(me.id, season.id);
    expect(stats.medals).toEqual({ gold: 1, silver: 0, bronze: 0 });
  });

  it("computes attendance as finished days where I played ≥1 scored match", async () => {
    const season = await makeSeason();
    const [me, a, b, c] = await Promise.all(["Me", "A", "B", "C"].map(makePlayer));
    const day1 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day1.id, matchNumber: 1,
        team1PlayerAId: me.id, team1PlayerBId: a.id,
        team2PlayerAId: b.id, team2PlayerBId: c.id,
        team1Score: 2, team2Score: 1,
      },
    });
    const day2 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-17"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day2.id, matchNumber: 1,
        team1PlayerAId: a.id, team1PlayerBId: b.id,
        team2PlayerAId: c.id, team2PlayerBId: await makePlayer("D").then((d) => d.id),
        team1Score: 1, team2Score: 1,
      },
    });
    const stats = await computePlayerSeasonStats(me.id, season.id);
    expect(stats.attendance).toEqual({ attended: 1, total: 2 });
  });

  it("computes win rate across all scored season matches (wins/losses/draws)", async () => {
    const season = await makeSeason();
    const [me, a, b, c] = await Promise.all(["Me", "A", "B", "C"].map(makePlayer));
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id, matchNumber: 1,
        team1PlayerAId: me.id, team1PlayerBId: a.id,
        team2PlayerAId: b.id, team2PlayerBId: c.id,
        team1Score: 3, team2Score: 1,
      },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id, matchNumber: 2,
        team1PlayerAId: me.id, team1PlayerBId: a.id,
        team2PlayerAId: b.id, team2PlayerBId: c.id,
        team1Score: 0, team2Score: 3,
      },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id, matchNumber: 3,
        team1PlayerAId: me.id, team1PlayerBId: a.id,
        team2PlayerAId: b.id, team2PlayerBId: c.id,
        team1Score: 2, team2Score: 2,
      },
    });
    const stats = await computePlayerSeasonStats(me.id, season.id);
    expect(stats.winRate).toEqual({ wins: 1, losses: 1, draws: 1, matches: 3 });
  });

  it("returns recent form newest-first across last 5 scored matches", async () => {
    const season = await makeSeason();
    const [me, a, b, c] = await Promise.all(["Me", "A", "B", "C"].map(makePlayer));
    const day1 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-03"), playerCount: 4, status: "finished" },
    });
    const day2 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    const day1Specs: Array<[number, number, number]> = [
      [1, 3, 0],
      [2, 0, 3],
      [3, 1, 1],
    ];
    for (const [n, t1, t2] of day1Specs) {
      await prisma.match.create({
        data: {
          gameDayId: day1.id, matchNumber: n,
          team1PlayerAId: me.id, team1PlayerBId: a.id,
          team2PlayerAId: b.id, team2PlayerBId: c.id,
          team1Score: t1, team2Score: t2,
        },
      });
    }
    const day2Specs: Array<[number, number, number]> = [
      [1, 3, 0],
      [2, 2, 0],
      [3, 0, 3],
    ];
    for (const [n, t1, t2] of day2Specs) {
      await prisma.match.create({
        data: {
          gameDayId: day2.id, matchNumber: n,
          team1PlayerAId: me.id, team1PlayerBId: a.id,
          team2PlayerAId: b.id, team2PlayerBId: c.id,
          team1Score: t1, team2Score: t2,
        },
      });
    }
    const stats = await computePlayerSeasonStats(me.id, season.id);
    expect(stats.recentForm).toEqual(["L", "W", "W", "D", "L"]);
  });

  it("computes best and worst partner by total points together", async () => {
    const season = await makeSeason();
    const [me, paul, michi, x, y] = await Promise.all(
      ["Me", "Paul", "Michi", "X", "Y"].map(makePlayer),
    );
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id, matchNumber: 1,
        team1PlayerAId: me.id, team1PlayerBId: paul.id,
        team2PlayerAId: x.id, team2PlayerBId: y.id,
        team1Score: 3, team2Score: 1,
      },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id, matchNumber: 2,
        team1PlayerAId: paul.id, team1PlayerBId: me.id,
        team2PlayerAId: x.id, team2PlayerBId: y.id,
        team1Score: 2, team2Score: 0,
      },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id, matchNumber: 3,
        team1PlayerAId: michi.id, team1PlayerBId: me.id,
        team2PlayerAId: x.id, team2PlayerBId: y.id,
        team1Score: 1, team2Score: 3,
      },
    });
    const stats = await computePlayerSeasonStats(me.id, season.id);
    expect(stats.bestPartner).toEqual({ name: "Paul", pointsTogether: 5, matches: 2 });
    expect(stats.worstPartner).toEqual({ name: "Michi", pointsTogether: 1, matches: 1 });
  });

  it("returns worstPartner as null when the player has only one distinct partner", async () => {
    const season = await makeSeason();
    const [me, paul, x, y] = await Promise.all(["Me", "Paul", "X", "Y"].map(makePlayer));
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id, matchNumber: 1,
        team1PlayerAId: me.id, team1PlayerBId: paul.id,
        team2PlayerAId: x.id, team2PlayerBId: y.id,
        team1Score: 3, team2Score: 1,
      },
    });
    const stats = await computePlayerSeasonStats(me.id, season.id);
    expect(stats.bestPartner).toEqual({ name: "Paul", pointsTogether: 3, matches: 1 });
    expect(stats.worstPartner).toBeNull();
  });

  it("computes joker balance from JokerUse rows for the season", async () => {
    const season = await makeSeason();
    const me = await makePlayer("Me");
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    await prisma.jokerUse.create({
      data: {
        playerId: me.id, seasonId: season.id, gameDayId: day.id,
        ppgAtUse: "2.500", gamesCredited: 10, pointsCredited: "25.00",
      },
    });
    const stats = await computePlayerSeasonStats(me.id, season.id);
    expect(stats.jokers).toEqual({ used: 1, remaining: 1, total: 2 });
  });
});
