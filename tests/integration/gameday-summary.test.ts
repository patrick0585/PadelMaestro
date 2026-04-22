import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { computeGameDaySummary } from "@/lib/game-day/summary";
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

describe("computeGameDaySummary", () => {
  beforeEach(resetDb);

  it("returns null for unknown id", async () => {
    const result = await computeGameDaySummary("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("aggregates points and matches per player", async () => {
    const season = await makeSeason();
    const [paul, patrick, michi, thomas] = await Promise.all(
      ["Paul", "Patrick", "Michi", "Thomas"].map(makeUser),
    );
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: paul.id,
        team1PlayerBId: patrick.id,
        team2PlayerAId: michi.id,
        team2PlayerBId: thomas.id,
        team1Score: 2,
        team2Score: 1,
      },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 2,
        team1PlayerAId: paul.id,
        team1PlayerBId: michi.id,
        team2PlayerAId: patrick.id,
        team2PlayerBId: thomas.id,
        team1Score: 3,
        team2Score: 0,
      },
    });

    const summary = await computeGameDaySummary(day.id);
    expect(summary).not.toBeNull();
    const byName = Object.fromEntries(summary!.rows.map((r) => [r.playerName, r]));
    expect(byName.Paul.points).toBe(5);
    expect(byName.Paul.matches).toBe(2);
    expect(byName.Patrick.points).toBe(2);
    expect(byName.Patrick.matches).toBe(2);
    expect(byName.Michi.points).toBe(4);
    expect(byName.Michi.matches).toBe(2);
    expect(byName.Thomas.points).toBe(1);
    expect(byName.Thomas.matches).toBe(2);
    expect(summary!.rows.map((r) => r.playerName)).toEqual([
      "Paul",
      "Michi",
      "Patrick",
      "Thomas",
    ]);
    expect(summary!.podium.map((r) => r.playerName)).toEqual(["Paul", "Michi", "Patrick"]);
  });

  it("tie-breaks by matches DESC then name ASC", async () => {
    const season = await makeSeason();
    const [a, b, c, d] = await Promise.all(["Anna", "Bert", "Cara", "Dirk"].map(makeUser));
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: a.id,
        team1PlayerBId: b.id,
        team2PlayerAId: c.id,
        team2PlayerBId: d.id,
        team1Score: 1,
        team2Score: 1,
      },
    });
    const summary = await computeGameDaySummary(day.id);
    expect(summary!.rows.map((r) => r.playerName)).toEqual(["Anna", "Bert", "Cara", "Dirk"]);
  });

  it("excludes matches with NULL scores", async () => {
    const season = await makeSeason();
    const [p1, p2, p3, p4] = await Promise.all(["P1", "P2", "P3", "P4"].map(makeUser));
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: p1.id,
        team1PlayerBId: p2.id,
        team2PlayerAId: p3.id,
        team2PlayerBId: p4.id,
        team1Score: null,
        team2Score: null,
      },
    });
    const summary = await computeGameDaySummary(day.id);
    expect(summary!.rows).toEqual([]);
    expect(summary!.podium).toEqual([]);
  });

  it("truncates the podium when fewer than 3 players played", async () => {
    const season = await makeSeason();
    const [p1, p2, p3, p4] = await Promise.all(["A", "B", "C", "D"].map(makeUser));
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), playerCount: 4, status: "finished" },
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
    const summary = await computeGameDaySummary(day.id);
    expect(summary!.podium).toHaveLength(3);
    expect(summary!.podium).toEqual(summary!.rows.slice(0, 3));
  });
});
