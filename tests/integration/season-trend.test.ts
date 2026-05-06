import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { buildSeasonTrend } from "@/lib/ranking/season-trend";
import { resetDb } from "../helpers/reset-db";

async function makeSeason() {
  const year = new Date().getFullYear();
  return prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
}

async function makeUser(name: string) {
  return prisma.player.create({
    data: { name, email: `${name.toLowerCase()}@x`, passwordHash: "x" },
  });
}

async function makeFinishedDay(seasonId: string, date: Date) {
  return prisma.gameDay.create({
    data: { seasonId, date, playerCount: 4, status: "finished" },
  });
}

async function makeMatch(
  gameDayId: string,
  matchNumber: number,
  team1: [string, string],
  team2: [string, string],
  team1Score: number,
  team2Score: number,
) {
  return prisma.match.create({
    data: {
      gameDayId,
      matchNumber,
      team1PlayerAId: team1[0],
      team1PlayerBId: team1[1],
      team2PlayerAId: team2[0],
      team2PlayerBId: team2[1],
      team1Score,
      team2Score,
    },
  });
}

describe("buildSeasonTrend", () => {
  beforeEach(resetDb);

  it("returns empty days+players when the season has no finished days", async () => {
    const season = await makeSeason();
    const trend = await buildSeasonTrend(season.id);
    expect(trend.days).toEqual([]);
    expect(trend.players).toEqual([]);
  });

  it("returns days oldest-first and one row per player who appeared", async () => {
    const season = await makeSeason();
    const [paul, patrick, michi, thomas] = await Promise.all([
      makeUser("Paul"),
      makeUser("Patrick"),
      makeUser("Michi"),
      makeUser("Thomas"),
    ]);
    // Day A (older): Paul wins 5pts, Patrick 4, Michi 3, Thomas 0
    const dayA = await makeFinishedDay(season.id, new Date("2026-04-01"));
    await makeMatch(dayA.id, 1, [paul.id, patrick.id], [michi.id, thomas.id], 3, 0);
    await makeMatch(dayA.id, 2, [paul.id, michi.id], [patrick.id, thomas.id], 2, 1);
    // Day B (newer): Thomas leads with strong scores
    const dayB = await makeFinishedDay(season.id, new Date("2026-04-08"));
    await makeMatch(dayB.id, 1, [thomas.id, paul.id], [patrick.id, michi.id], 3, 0);
    await makeMatch(dayB.id, 2, [thomas.id, patrick.id], [paul.id, michi.id], 3, 0);

    const trend = await buildSeasonTrend(season.id);

    expect(trend.days.map((d) => d.date.toISOString().slice(0, 10))).toEqual([
      "2026-04-01",
      "2026-04-08",
    ]);
    expect(trend.days.every((d) => d.totalPlayers === 4)).toBe(true);

    const byName = Object.fromEntries(trend.players.map((p) => [p.name, p.values]));
    // Day A: Paul 5, Patrick 4, Michi 3, Thomas 0  → 1,2,3,4
    // Day B: Thomas 6, Patrick 3 (won + lost), Paul 3 (won + lost), Michi 0 → ranks tie-broken by matches/name
    //   Thomas plays 2, gets 6   → 1.
    //   Patrick plays 2, gets 3  → 2/3 (tie with Paul on points & matches → name asc)
    //   Paul plays 2, gets 3     → 2/3
    //   Michi plays 2, gets 0    → 4.
    expect(byName.Paul).toEqual([1, 3]); // alphabetical wins tie at rank 2/3 → Patrick 2, Paul 3
    expect(byName.Patrick).toEqual([2, 2]);
    expect(byName.Michi).toEqual([3, 4]);
    expect(byName.Thomas).toEqual([4, 1]);
  });

  it("emits null for a player who skipped a specific day", async () => {
    const season = await makeSeason();
    const [paul, patrick, michi, thomas, eva] = await Promise.all([
      makeUser("Paul"),
      makeUser("Patrick"),
      makeUser("Michi"),
      makeUser("Thomas"),
      makeUser("Eva"),
    ]);
    // Day A: Paul/Patrick/Michi/Thomas play (no Eva)
    const dayA = await makeFinishedDay(season.id, new Date("2026-04-01"));
    await makeMatch(dayA.id, 1, [paul.id, patrick.id], [michi.id, thomas.id], 2, 1);
    // Day B: Eva replaces Thomas
    const dayB = await makeFinishedDay(season.id, new Date("2026-04-08"));
    await makeMatch(dayB.id, 1, [paul.id, eva.id], [patrick.id, michi.id], 3, 0);

    const trend = await buildSeasonTrend(season.id);
    const byName = Object.fromEntries(trend.players.map((p) => [p.name, p.values]));

    // Day A had only one 2:1 match → Paul/Patrick tied at 2pts (Paul wins
    // tie alphabetically, rank 1; Patrick rank 2), Michi/Thomas tied at
    // 1pt (Michi wins tie alphabetically, rank 3; Thomas rank 4).
    expect(byName.Eva).toEqual([null, 1]); // skipped day A, won day B
    expect(byName.Thomas).toEqual([4, null]); // rank 4 of day A, skipped day B
  });

  it("orders ties by matches DESC then name ASC, like computeGameDaySummary", async () => {
    const season = await makeSeason();
    const [alice, bob, carol, dirk, eva] = await Promise.all([
      makeUser("Alice"),
      makeUser("Bob"),
      makeUser("Carol"),
      makeUser("Dirk"),
      makeUser("Eva"),
    ]);
    // Construct points so Alice/Bob/Dirk/Eva all reach 4 points but Alice
    // played 3 matches while Bob/Dirk/Eva played 2 — a fixture that fails
    // if the matches-tiebreaker is dropped or inverted.
    const day = await makeFinishedDay(season.id, new Date("2026-04-01"));
    await makeMatch(day.id, 1, [alice.id, bob.id], [carol.id, dirk.id], 2, 1);
    await makeMatch(day.id, 2, [alice.id, bob.id], [carol.id, eva.id], 2, 1);
    await makeMatch(day.id, 3, [alice.id, carol.id], [dirk.id, eva.id], 0, 3);
    // Resulting per-player totals (points/matches):
    //   Alice 4/3 — 3 matches
    //   Bob   4/2 — 2 matches
    //   Dirk  4/2 — 2 matches
    //   Eva   4/2 — 2 matches
    //   Carol 2/3 — last on points, irrelevant for the tiebreaker focus
    const trend = await buildSeasonTrend(season.id);
    const byName = Object.fromEntries(trend.players.map((p) => [p.name, p.values]));

    expect(byName.Alice).toEqual([1]); // matches > Bob/Dirk/Eva at same points
    expect(byName.Bob).toEqual([2]); // name asc among the 2-match tie group
    expect(byName.Dirk).toEqual([3]);
    expect(byName.Eva).toEqual([4]);
    expect(byName.Carol).toEqual([5]);
  });

  it("ignores planned/in-progress days and only reports finished ones", async () => {
    const season = await makeSeason();
    const [paul, patrick, michi, thomas] = await Promise.all([
      makeUser("Paul"),
      makeUser("Patrick"),
      makeUser("Michi"),
      makeUser("Thomas"),
    ]);
    // Finished day
    const finished = await makeFinishedDay(season.id, new Date("2026-04-01"));
    await makeMatch(finished.id, 1, [paul.id, patrick.id], [michi.id, thomas.id], 2, 1);
    // Planned day with the same players — must NOT appear in the trend
    await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-08"), playerCount: 4, status: "planned" },
    });

    const trend = await buildSeasonTrend(season.id);
    expect(trend.days).toHaveLength(1);
    expect(trend.players.every((p) => p.values.length === 1)).toBe(true);
  });
});
