import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { listArchivedGameDays } from "@/lib/archive/list";
import { resetDb } from "../helpers/reset-db";

async function makeSeason(year = new Date().getFullYear()) {
  return prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
}

async function makeUser(name: string) {
  return prisma.player.create({
    data: { name, email: `${name.toLowerCase()}@x`, passwordHash: "x" },
  });
}

describe("listArchivedGameDays", () => {
  beforeEach(resetDb);

  it("returns empty array when no finished days exist", async () => {
    const result = await listArchivedGameDays(null);
    expect(result).toEqual([]);
  });

  it("aggregates matchCount, playerCount, and podium per finished day", async () => {
    const season = await makeSeason(2026);
    const [paul, patrick, michi, thomas] = await Promise.all(
      ["Paul", "Patrick", "Michi", "Thomas"].map(makeUser),
    );
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-17"), playerCount: 4, status: "finished" },
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

    const result = await listArchivedGameDays(null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(day.id);
    expect(result[0].seasonYear).toBe(2026);
    expect(result[0].matchCount).toBe(2);
    expect(result[0].playerCount).toBe(4);
    expect(result[0].podium.map((p) => p.playerName)).toEqual(["Paul", "Michi", "Patrick"]);
    expect(result[0].podium[0].points).toBe(5);
    expect(result[0].self).toBeNull();
  });

  it("returns correct matchCount when no single player played all matches", async () => {
    const season = await makeSeason(2026);
    const players = await Promise.all(
      ["A", "B", "C", "D", "E", "F", "G", "H"].map(makeUser),
    );
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 8, status: "finished" },
    });
    // Match 1: A,B vs C,D
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: players[0].id,
        team1PlayerBId: players[1].id,
        team2PlayerAId: players[2].id,
        team2PlayerBId: players[3].id,
        team1Score: 2,
        team2Score: 1,
      },
    });
    // Match 2: E,F vs G,H — fully disjoint players, no overlap with match 1
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 2,
        team1PlayerAId: players[4].id,
        team1PlayerBId: players[5].id,
        team2PlayerAId: players[6].id,
        team2PlayerBId: players[7].id,
        team1Score: 3,
        team2Score: 0,
      },
    });

    const result = await listArchivedGameDays(null);
    expect(result).toHaveLength(1);
    expect(result[0].matchCount).toBe(2);
    expect(result[0].playerCount).toBe(8);
  });
});
