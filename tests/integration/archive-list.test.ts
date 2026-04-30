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

async function makeFinishedDayWithOneMatch(
  seasonId: string,
  date: Date,
  players: { id: string }[],
): Promise<{ id: string }> {
  const [a, b, c, d] = players;
  const day = await prisma.gameDay.create({
    data: { seasonId, date, playerCount: 4, status: "finished" },
  });
  await prisma.match.create({
    data: {
      gameDayId: day.id,
      matchNumber: 1,
      team1PlayerAId: a.id,
      team1PlayerBId: b.id,
      team2PlayerAId: c.id,
      team2PlayerBId: d.id,
      team1Score: 2,
      team2Score: 1,
    },
  });
  return day;
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

  it("populates self block for participating player", async () => {
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

    const resultForPatrick = await listArchivedGameDays(patrick.id);
    expect(resultForPatrick[0].self).toEqual({ points: 2, matches: 1 });
  });

  it("returns null self block for non-participating player", async () => {
    const season = await makeSeason(2026);
    const [paul, patrick, michi, thomas, outsider] = await Promise.all(
      ["Paul", "Patrick", "Michi", "Thomas", "Outsider"].map(makeUser),
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

    const result = await listArchivedGameDays(outsider.id);
    expect(result[0].self).toBeNull();
  });

  it("sorts by date DESC then id DESC", async () => {
    // Use two seasons because GameDay has @@unique([seasonId, date]);
    // we still exercise date-DESC sort across seasons and id-DESC tiebreak on same date.
    const seasonA = await prisma.season.create({
      data: { year: 2025, startDate: new Date(2025, 0, 1), endDate: new Date(2025, 11, 31), isActive: false },
    });
    const seasonB = await prisma.season.create({
      data: { year: 2026, startDate: new Date(2026, 0, 1), endDate: new Date(2026, 11, 31), isActive: true },
    });
    const [paul, patrick, michi, thomas] = await Promise.all(
      ["Paul", "Patrick", "Michi", "Thomas"].map(makeUser),
    );
    const dayOlder = await prisma.gameDay.create({
      data: { seasonId: seasonB.id, date: new Date("2026-03-10"), playerCount: 4, status: "finished" },
    });
    const dayNewerA = await prisma.gameDay.create({
      data: { seasonId: seasonA.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    const dayNewerB = await prisma.gameDay.create({
      data: { seasonId: seasonB.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    for (const d of [dayOlder, dayNewerA, dayNewerB]) {
      await prisma.match.create({
        data: {
          gameDayId: d.id,
          matchNumber: 1,
          team1PlayerAId: paul.id,
          team1PlayerBId: patrick.id,
          team2PlayerAId: michi.id,
          team2PlayerBId: thomas.id,
          team1Score: 2,
          team2Score: 1,
        },
      });
    }

    const result = await listArchivedGameDays(null);
    expect(result.map((r) => r.id)).toEqual(
      [dayNewerA.id, dayNewerB.id].sort().reverse().concat(dayOlder.id),
    );
  });

  it("excludes game days whose status is not finished", async () => {
    const season = await makeSeason(2026);
    const [paul, patrick, michi, thomas] = await Promise.all(
      ["Paul", "Patrick", "Michi", "Thomas"].map(makeUser),
    );
    const plannedDay = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-18"), playerCount: 4, status: "planned" },
    });
    const inProgressDay = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-19"), playerCount: 4, status: "in_progress" },
    });
    const rosterLockedDay = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-20"), playerCount: 4, status: "in_progress" },
    });
    for (const d of [plannedDay, inProgressDay, rosterLockedDay]) {
      await prisma.match.create({
        data: {
          gameDayId: d.id,
          matchNumber: 1,
          team1PlayerAId: paul.id,
          team1PlayerBId: patrick.id,
          team2PlayerAId: michi.id,
          team2PlayerBId: thomas.id,
          team1Score: 2,
          team2Score: 1,
        },
      });
    }
    const finishedDay = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: finishedDay.id,
        matchNumber: 1,
        team1PlayerAId: paul.id,
        team1PlayerBId: patrick.id,
        team2PlayerAId: michi.id,
        team2PlayerBId: thomas.id,
        team1Score: 2,
        team2Score: 1,
      },
    });

    const result = await listArchivedGameDays(null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(finishedDay.id);
  });

  it("populates jokerCount per finished day", async () => {
    const season = await makeSeason(2026);
    const players = await Promise.all(
      ["Paul", "Patrick", "Michi", "Thomas"].map(makeUser),
    );
    const [paul, patrick] = players;
    const day = await makeFinishedDayWithOneMatch(season.id, new Date("2026-04-17"), players);
    await prisma.jokerUse.create({
      data: {
        playerId: paul.id,
        seasonId: season.id,
        gameDayId: day.id,
        ppgAtUse: "1.000",
        gamesCredited: 10,
        pointsCredited: "10.00",
      },
    });
    await prisma.jokerUse.create({
      data: {
        playerId: patrick.id,
        seasonId: season.id,
        gameDayId: day.id,
        ppgAtUse: "1.500",
        gamesCredited: 10,
        pointsCredited: "15.00",
      },
    });

    const result = await listArchivedGameDays(null);
    expect(result).toHaveLength(1);
    expect(result[0].jokerCount).toBe(2);
  });

  it("defaults jokerCount to 0 when no jokers were used", async () => {
    const season = await makeSeason(2026);
    const players = await Promise.all(
      ["Paul", "Patrick", "Michi", "Thomas"].map(makeUser),
    );
    await makeFinishedDayWithOneMatch(season.id, new Date("2026-04-17"), players);
    const result = await listArchivedGameDays(null);
    expect(result).toHaveLength(1);
    expect(result[0].jokerCount).toBe(0);
  });
});
