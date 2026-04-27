import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { computeRanking } from "@/lib/ranking/compute";
import { resetDb } from "../helpers/reset-db";

describe("computeRanking", () => {
  beforeEach(resetDb);

  it("returns empty list when no matches exist", async () => {
    const year = new Date().getFullYear();
    const season = await prisma.season.create({
      data: {
        year,
        startDate: new Date(year, 0, 1),
        endDate: new Date(year, 11, 31),
        isActive: true,
      },
    });
    const ranking = await computeRanking(season.id);
    expect(ranking).toEqual([]);
  });

  it("aggregates points and games from completed matches", async () => {
    const year = new Date().getFullYear();
    const season = await prisma.season.create({
      data: {
        year,
        startDate: new Date(year, 0, 1),
        endDate: new Date(year, 11, 31),
        isActive: true,
      },
    });
    const [p1, p2, p3, p4] = await Promise.all(
      [1, 2, 3, 4].map((i) =>
        prisma.player.create({ data: { name: `P${i}`, email: `p${i}@x`, passwordHash: "x" } }),
      ),
    );
    const gd = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), playerCount: 4 },
    });
    await prisma.match.create({
      data: {
        gameDayId: gd.id,
        matchNumber: 1,
        team1PlayerAId: p1.id,
        team1PlayerBId: p2.id,
        team2PlayerAId: p3.id,
        team2PlayerBId: p4.id,
        team1Score: 3,
        team2Score: 1,
      },
    });

    const ranking = await computeRanking(season.id);
    expect(ranking).toHaveLength(4);
    const paul = ranking.find((r) => r.playerId === p1.id)!;
    expect(paul.games).toBe(1);
    expect(paul.points).toBe(3);
    expect(paul.pointsPerGame).toBeCloseTo(3);

    const thomas = ranking.find((r) => r.playerId === p3.id)!;
    expect(thomas.games).toBe(1);
    expect(thomas.points).toBe(1);
  });

  it("sorts by total points with points-per-game as tiebreaker", async () => {
    const year = new Date().getFullYear();
    const season = await prisma.season.create({
      data: {
        year,
        startDate: new Date(year, 0, 1),
        endDate: new Date(year, 11, 31),
        isActive: true,
      },
    });
    const [highPpg, highTotal] = await Promise.all(
      ["HighPpg", "HighTotal"].map((n) =>
        prisma.player.create({ data: { name: n, email: `${n}@x`, passwordHash: "x" } }),
      ),
    );
    const gd = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-24"), playerCount: 5 },
    });
    // HighPpg: 1 game, 5 points → Ø 5, total 5
    await prisma.jokerUse.create({
      data: {
        playerId: highPpg.id,
        seasonId: season.id,
        gameDayId: gd.id,
        ppgAtUse: "5",
        gamesCredited: 1,
        pointsCredited: "5.00",
      },
    });
    // HighTotal: 3 games, 9 points → Ø 3, total 9
    await prisma.jokerUse.create({
      data: {
        playerId: highTotal.id,
        seasonId: season.id,
        gameDayId: gd.id,
        ppgAtUse: "3",
        gamesCredited: 3,
        pointsCredited: "9.00",
      },
    });

    const ranking = await computeRanking(season.id);
    expect(ranking.map((r) => r.playerName)).toEqual(["HighTotal", "HighPpg"]);
    expect(ranking[0].rank).toBe(1);
    expect(ranking[1].rank).toBe(2);
  });

  it("aggregates medals across finished game days", async () => {
    const year = new Date().getFullYear();
    const season = await prisma.season.create({
      data: {
        year,
        startDate: new Date(year, 0, 1),
        endDate: new Date(year, 11, 31),
        isActive: true,
      },
    });
    const [p1, p2, p3, p4] = await Promise.all(
      [1, 2, 3, 4].map((i) =>
        prisma.player.create({ data: { name: `P${i}`, email: `p${i}@x`, passwordHash: "x" } }),
      ),
    );

    // Day 1 (finished): p1 gold (3 pts), p2 silver (1 pt), p3 + p4 tied last (1 pt each — alphabetical → p3 bronze)
    const day1 = await prisma.gameDay.create({
      data: {
        seasonId: season.id,
        date: new Date("2026-04-21"),
        playerCount: 4,
        status: "finished",
      },
    });
    await prisma.match.create({
      data: {
        gameDayId: day1.id,
        matchNumber: 1,
        team1PlayerAId: p1.id,
        team1PlayerBId: p2.id,
        team2PlayerAId: p3.id,
        team2PlayerBId: p4.id,
        team1Score: 3,
        team2Score: 1,
      },
    });

    // Day 2 (finished): p1 gold again, p3 silver, p2 bronze
    const day2 = await prisma.gameDay.create({
      data: {
        seasonId: season.id,
        date: new Date("2026-04-22"),
        playerCount: 4,
        status: "finished",
      },
    });
    await prisma.match.create({
      data: {
        gameDayId: day2.id,
        matchNumber: 1,
        team1PlayerAId: p1.id,
        team1PlayerBId: p3.id,
        team2PlayerAId: p2.id,
        team2PlayerBId: p4.id,
        team1Score: 3,
        team2Score: 0,
      },
    });
    await prisma.match.create({
      data: {
        gameDayId: day2.id,
        matchNumber: 2,
        team1PlayerAId: p2.id,
        team1PlayerBId: p4.id,
        team2PlayerAId: p1.id,
        team2PlayerBId: p3.id,
        team1Score: 1,
        team2Score: 2,
      },
    });

    // Day 3 (in_progress) — must NOT contribute medals
    const day3 = await prisma.gameDay.create({
      data: {
        seasonId: season.id,
        date: new Date("2026-04-23"),
        playerCount: 4,
        status: "in_progress",
      },
    });
    await prisma.match.create({
      data: {
        gameDayId: day3.id,
        matchNumber: 1,
        team1PlayerAId: p4.id,
        team1PlayerBId: p2.id,
        team2PlayerAId: p1.id,
        team2PlayerBId: p3.id,
        team1Score: 3,
        team2Score: 0,
      },
    });

    const ranking = await computeRanking(season.id);
    const byId = new Map(ranking.map((r) => [r.playerId, r]));
    expect(byId.get(p1.id)?.medals).toEqual({ gold: 2, silver: 0, bronze: 0 });
    expect(byId.get(p2.id)?.medals).toEqual({ gold: 0, silver: 1, bronze: 1 });
    expect(byId.get(p3.id)?.medals).toEqual({ gold: 0, silver: 1, bronze: 1 });
    expect(byId.get(p4.id)?.medals).toEqual({ gold: 0, silver: 0, bronze: 0 });
  });

  it("breaks podium ties alphabetically (de locale) when two players have identical points and matches", async () => {
    const year = new Date().getFullYear();
    const season = await prisma.season.create({
      data: {
        year,
        startDate: new Date(year, 0, 1),
        endDate: new Date(year, 11, 31),
        isActive: true,
      },
    });
    // Names chosen so the German locale tiebreaker is exercised: "Älice" sorts
    // before "Bob" under de collation, "Carl" before "Dave".
    const [alice, bob, carl, dave] = await Promise.all(
      ["Älice", "Bob", "Carl", "Dave"].map((n) =>
        prisma.player.create({ data: { name: n, email: `${n}@x`, passwordHash: "x" } }),
      ),
    );
    const day = await prisma.gameDay.create({
      data: {
        seasonId: season.id,
        date: new Date("2026-04-21"),
        playerCount: 4,
        status: "finished",
      },
    });
    // 3-0: Älice + Bob each 3 pts, Carl + Dave each 0 pts. Both pairs tie.
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: alice.id,
        team1PlayerBId: bob.id,
        team2PlayerAId: carl.id,
        team2PlayerBId: dave.id,
        team1Score: 3,
        team2Score: 0,
      },
    });

    const ranking = await computeRanking(season.id);
    const byId = new Map(ranking.map((r) => [r.playerId, r]));
    expect(byId.get(alice.id)?.medals).toEqual({ gold: 1, silver: 0, bronze: 0 });
    expect(byId.get(bob.id)?.medals).toEqual({ gold: 0, silver: 1, bronze: 0 });
    expect(byId.get(carl.id)?.medals).toEqual({ gold: 0, silver: 0, bronze: 1 });
    expect(byId.get(dave.id)?.medals).toEqual({ gold: 0, silver: 0, bronze: 0 });
  });

  it("does not award a phantom bronze on a 2-player game day", async () => {
    const year = new Date().getFullYear();
    const season = await prisma.season.create({
      data: {
        year,
        startDate: new Date(year, 0, 1),
        endDate: new Date(year, 11, 31),
        isActive: true,
      },
    });
    const [p1, p2] = await Promise.all(
      [1, 2].map((i) =>
        prisma.player.create({ data: { name: `P${i}`, email: `p${i}@x`, passwordHash: "x" } }),
      ),
    );
    const day = await prisma.gameDay.create({
      data: {
        seasonId: season.id,
        date: new Date("2026-04-21"),
        playerCount: 2,
        status: "finished",
      },
    });
    // Degenerate fixture (each "team" is the same player twice) — exercises
    // the pos<=3 boundary on a sub-3-player day.
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: p1.id,
        team1PlayerBId: p1.id,
        team2PlayerAId: p2.id,
        team2PlayerBId: p2.id,
        team1Score: 3,
        team2Score: 0,
      },
    });

    const ranking = await computeRanking(season.id);
    const byId = new Map(ranking.map((r) => [r.playerId, r]));
    expect(byId.get(p1.id)?.medals).toEqual({ gold: 1, silver: 0, bronze: 0 });
    expect(byId.get(p2.id)?.medals).toEqual({ gold: 0, silver: 1, bronze: 0 });
  });

  it("excludes soft-deleted players from the ranking even if they medaled", async () => {
    const year = new Date().getFullYear();
    const season = await prisma.season.create({
      data: {
        year,
        startDate: new Date(year, 0, 1),
        endDate: new Date(year, 11, 31),
        isActive: true,
      },
    });
    const [p1, p2, p3, p4] = await Promise.all(
      [1, 2, 3, 4].map((i) =>
        prisma.player.create({ data: { name: `P${i}`, email: `p${i}@x`, passwordHash: "x" } }),
      ),
    );
    const day = await prisma.gameDay.create({
      data: {
        seasonId: season.id,
        date: new Date("2026-04-21"),
        playerCount: 4,
        status: "finished",
      },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: p1.id,
        team1PlayerBId: p2.id,
        team2PlayerAId: p3.id,
        team2PlayerBId: p4.id,
        team1Score: 3,
        team2Score: 0,
      },
    });
    await prisma.player.update({ where: { id: p1.id }, data: { deletedAt: new Date() } });

    const ranking = await computeRanking(season.id);
    const ids = ranking.map((r) => r.playerId);
    expect(ids).not.toContain(p1.id);
    expect(ids).toContain(p2.id);
  });

  it("returns zero medals for everyone when no day is finished yet", async () => {
    const year = new Date().getFullYear();
    const season = await prisma.season.create({
      data: {
        year,
        startDate: new Date(year, 0, 1),
        endDate: new Date(year, 11, 31),
        isActive: true,
      },
    });
    const [p1, p2, p3, p4] = await Promise.all(
      [1, 2, 3, 4].map((i) =>
        prisma.player.create({ data: { name: `P${i}`, email: `p${i}@x`, passwordHash: "x" } }),
      ),
    );
    const gd = await prisma.gameDay.create({
      data: {
        seasonId: season.id,
        date: new Date("2026-04-21"),
        playerCount: 4,
        status: "in_progress",
      },
    });
    await prisma.match.create({
      data: {
        gameDayId: gd.id,
        matchNumber: 1,
        team1PlayerAId: p1.id,
        team1PlayerBId: p2.id,
        team2PlayerAId: p3.id,
        team2PlayerBId: p4.id,
        team1Score: 3,
        team2Score: 0,
      },
    });

    const ranking = await computeRanking(season.id);
    for (const r of ranking) {
      expect(r.medals).toEqual({ gold: 0, silver: 0, bronze: 0 });
    }
  });

  it("includes joker uses in ranking totals", async () => {
    const year = new Date().getFullYear();
    const season = await prisma.season.create({
      data: {
        year,
        startDate: new Date(year, 0, 1),
        endDate: new Date(year, 11, 31),
        isActive: true,
      },
    });
    const player = await prisma.player.create({
      data: { name: "Joker User", email: "j@x", passwordHash: "x" },
    });
    const gd = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), playerCount: 5 },
    });
    await prisma.jokerUse.create({
      data: {
        playerId: player.id,
        seasonId: season.id,
        gameDayId: gd.id,
        ppgAtUse: "1.5",
        gamesCredited: 10,
        pointsCredited: "15.00",
      },
    });

    const ranking = await computeRanking(season.id);
    expect(ranking).toHaveLength(1);
    expect(ranking[0].games).toBe(10);
    expect(ranking[0].points).toBeCloseTo(15);
    expect(ranking[0].pointsPerGame).toBeCloseTo(1.5);
    expect(ranking[0].jokersUsed).toBe(1);
  });
});
