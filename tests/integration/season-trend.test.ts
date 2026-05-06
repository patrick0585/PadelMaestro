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
    expect(trend.totalPlayers).toBe(0);
  });

  it("ranks by points DESC then ppg DESC, accumulating across days", async () => {
    const season = await makeSeason();
    const [paul, patrick, michi, thomas] = await Promise.all([
      makeUser("Paul"),
      makeUser("Patrick"),
      makeUser("Michi"),
      makeUser("Thomas"),
    ]);
    // Day A: tennis-set scoring (4 players, format flag is informational
    // here — buildSeasonTrend only reads team1/team2 scores).
    //   Match 1: Paul/Patrick beat Michi/Thomas 3:0  → Paul 3, Patrick 3, Michi 0, Thomas 0
    //   Match 2: Paul/Michi vs Patrick/Thomas 2:1     → Paul +2, Michi +2, Patrick +1, Thomas +1
    // After Day A:  Paul 5/2, Patrick 4/2, Michi 2/2, Thomas 1/2
    const dayA = await makeFinishedDay(season.id, new Date("2026-04-01"));
    await makeMatch(dayA.id, 1, [paul.id, patrick.id], [michi.id, thomas.id], 3, 0);
    await makeMatch(dayA.id, 2, [paul.id, michi.id], [patrick.id, thomas.id], 2, 1);
    // Day B: Thomas dominates
    //   Match 1: Thomas/Paul beat Patrick/Michi 3:0  → Thomas 3, Paul 3, Patrick 0, Michi 0
    //   Match 2: Thomas/Patrick beat Paul/Michi 3:0  → Thomas +3, Patrick +3, Paul 0, Michi 0
    // Cumulative after Day B:
    //   Paul    5+3+0=8 / 4 games  → ppg 2.0
    //   Patrick 4+0+3=7 / 4 games  → ppg 1.75
    //   Thomas  1+3+3=7 / 4 games  → ppg 1.75
    //   Michi   2+0+0=2 / 4 games  → ppg 0.5
    const dayB = await makeFinishedDay(season.id, new Date("2026-04-08"));
    await makeMatch(dayB.id, 1, [thomas.id, paul.id], [patrick.id, michi.id], 3, 0);
    await makeMatch(dayB.id, 2, [thomas.id, patrick.id], [paul.id, michi.id], 3, 0);

    const trend = await buildSeasonTrend(season.id);
    expect(trend.totalPlayers).toBe(4);
    expect(trend.days.map((d) => d.date.toISOString().slice(0, 10))).toEqual([
      "2026-04-01",
      "2026-04-08",
    ]);
    const byName = Object.fromEntries(trend.players.map((p) => [p.name, p.values]));
    // Day A standings: Paul 5pts, Patrick 4, Michi 2, Thomas 1.
    // Day B cumulative: Paul 8 (rank 1), Patrick & Thomas tied on 7pts;
    // tiebreaker is ppg — both 1.75 — so they're fully tied. Comparator
    // returns 0; Patrick was inserted first (Day A) so he comes first.
    // Then Michi at rank 4.
    expect(byName.Paul).toEqual([1, 1]);
    expect(byName.Patrick).toEqual([2, 2]);
    expect(byName.Michi).toEqual([3, 4]);
    expect(byName.Thomas).toEqual([4, 3]);
  });

  it("emits null for a player who has not yet appeared by a given day", async () => {
    const season = await makeSeason();
    const [paul, patrick, michi, thomas, eva] = await Promise.all([
      makeUser("Paul"),
      makeUser("Patrick"),
      makeUser("Michi"),
      makeUser("Thomas"),
      makeUser("Eva"),
    ]);
    // Day A: only Paul/Patrick/Michi/Thomas play. Eva has never appeared
    // in the season → null at the end of Day A.
    const dayA = await makeFinishedDay(season.id, new Date("2026-04-01"));
    await makeMatch(dayA.id, 1, [paul.id, patrick.id], [michi.id, thomas.id], 2, 1);
    // Day B: Eva plays for the first time → she gains a rank from Day B onward.
    const dayB = await makeFinishedDay(season.id, new Date("2026-04-08"));
    await makeMatch(dayB.id, 1, [paul.id, eva.id], [patrick.id, michi.id], 3, 0);

    const trend = await buildSeasonTrend(season.id);
    const byName = Object.fromEntries(trend.players.map((p) => [p.name, p.values]));
    // Day A: Paul 2, Patrick 2, Michi 1, Thomas 1, Eva not yet.
    //   Tied 2pts: Paul & Patrick — both ppg 2.0 — fully tied. Insertion
    //   order from match-credit: team1 first, so Paul (team1A) before
    //   Patrick (team1B). Then Michi & Thomas tied at 1pt/1g, again
    //   insertion order: Michi (team2A) before Thomas (team2B).
    // Day B: cumulative
    //   Paul 2+3=5, ppg 5/2=2.5
    //   Eva  3,    ppg 3/1=3.0
    //   Patrick 2+0=2, ppg 2/2=1.0
    //   Michi 1+0=1, ppg 1/2=0.5
    //   Thomas 1+0=1, ppg 1/1=1.0  (Thomas didn't play Day B)
    //   Sort: Paul 5pts → 1, Eva 3pts → 2, Patrick 2pts → 3,
    //         Thomas 1pt/ppg1.0 → 4 (ppg DESC beats Michi 0.5),
    //         Michi 1pt/ppg0.5 → 5
    expect(byName.Paul).toEqual([1, 1]);
    expect(byName.Eva[0]).toBeNull();
    expect(byName.Eva[1]).toBe(2);
    expect(byName.Patrick).toEqual([2, 3]);
    // Thomas at end of Day B: 1pt over 1 game (didn't play Day B), ppg 1.0.
    // Michi: 1pt over 2 games, ppg 0.5. Thomas's higher ppg ranks above
    // Michi by the NULLS LAST ordering. Both are below Patrick (2pts).
    expect(byName.Thomas[1]).toBeLessThan(byName.Michi[1]);
    expect(byName.Patrick[1]).toBeLessThan(byName.Thomas[1]);
    // Day A: Patrick beat Michi/Thomas because of more points;
    // Michi beat Thomas only by Map insertion order (fully tied
    // 1pt/1g/ppg 1.0). Assert the points-driven ordering, not the tie.
    expect(byName.Patrick[0]).toBeLessThan(byName.Michi[0]);
    expect(byName.Patrick[0]).toBeLessThan(byName.Thomas[0]);
  });

  it("places players with games but lower ppg above players with zero games (NULLS LAST)", async () => {
    const season = await makeSeason();
    const [active1, active2, active3, active4, joker] = await Promise.all([
      makeUser("Anna"),
      makeUser("Ben"),
      makeUser("Clara"),
      makeUser("Dirk"),
      makeUser("Eva"),
    ]);
    // Active players play one match. Eva uses a joker on the same day
    // (zero games credited so her ppg is undefined → NULLS LAST).
    const day = await makeFinishedDay(season.id, new Date("2026-04-01"));
    await makeMatch(day.id, 1, [active1.id, active2.id], [active3.id, active4.id], 2, 1);
    await prisma.jokerUse.create({
      data: {
        playerId: joker.id,
        seasonId: season.id,
        gameDayId: day.id,
        ppgAtUse: 0,
        gamesCredited: 0,
        pointsCredited: 0,
      },
    });

    const trend = await buildSeasonTrend(season.id);
    expect(trend.totalPlayers).toBe(5);
    const byName = Object.fromEntries(trend.players.map((p) => [p.name, p.values]));
    // Active1 & Active2 tied at 2pts/1g (ppg 2.0). Insertion order from
    // match credit puts Anna (team1A) before Ben (team1B).
    // Then Clara & Dirk tied at 1pt/1g (ppg 1.0). Clara before Dirk by
    // insertion order. Eva has 0pts/0g → ppg null → NULLS LAST → rank 5.
    expect(byName.Anna).toEqual([1]);
    expect(byName.Ben).toEqual([2]);
    expect(byName.Clara).toEqual([3]);
    expect(byName.Dirk).toEqual([4]);
    expect(byName.Eva).toEqual([5]);
  });

  it("ignores planned/in-progress days and only reports finished ones", async () => {
    const season = await makeSeason();
    const [paul, patrick, michi, thomas] = await Promise.all([
      makeUser("Paul"),
      makeUser("Patrick"),
      makeUser("Michi"),
      makeUser("Thomas"),
    ]);
    const finished = await makeFinishedDay(season.id, new Date("2026-04-01"));
    await makeMatch(finished.id, 1, [paul.id, patrick.id], [michi.id, thomas.id], 2, 1);
    await prisma.gameDay.create({
      data: {
        seasonId: season.id,
        date: new Date("2026-04-08"),
        playerCount: 4,
        status: "planned",
      },
    });

    const trend = await buildSeasonTrend(season.id);
    expect(trend.days).toHaveLength(1);
    expect(trend.players.every((p) => p.values.length === 1)).toBe(true);
  });
});
