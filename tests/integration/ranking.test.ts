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
