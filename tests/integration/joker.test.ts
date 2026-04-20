import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { useJoker, JOKER_GAMES_CREDITED, MAX_JOKERS_PER_SEASON } from "@/lib/joker/use";

async function resetDb() {
  await prisma.auditLog.deleteMany();
  await prisma.jokerUse.deleteMany();
  await prisma.match.deleteMany();
  await prisma.gameDayParticipant.deleteMany();
  await prisma.gameDay.deleteMany();
  await prisma.season.deleteMany();
  await prisma.player.deleteMany();
}

async function setup() {
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
    data: { name: "X", email: "x@x", passwordHash: "x" },
  });
  const gameDay = await prisma.gameDay.create({
    data: { seasonId: season.id, date: new Date("2026-04-21"), status: "planned" },
  });
  await prisma.gameDayParticipant.create({
    data: { gameDayId: gameDay.id, playerId: player.id, attendance: "pending" },
  });
  return { season, player, gameDay };
}

describe("useJoker", () => {
  beforeEach(resetDb);

  it("creates a JokerUse with a ppg snapshot and marks attendance=joker", async () => {
    const { player, gameDay } = await setup();
    const use = await useJoker({ playerId: player.id, gameDayId: gameDay.id });

    expect(use.gamesCredited).toBe(JOKER_GAMES_CREDITED);
    expect(Number(use.ppgAtUse)).toBe(0);
    expect(Number(use.pointsCredited)).toBe(0);

    const part = await prisma.gameDayParticipant.findUniqueOrThrow({
      where: { gameDayId_playerId: { gameDayId: gameDay.id, playerId: player.id } },
    });
    expect(part.attendance).toBe("joker");
  });

  it("snapshots current ppg when player has prior matches", async () => {
    const { season, player, gameDay } = await setup();
    const partner = await prisma.player.create({
      data: { name: "Y", email: "y@x", passwordHash: "x" },
    });
    const opp1 = await prisma.player.create({
      data: { name: "O1", email: "o1@x", passwordHash: "x" },
    });
    const opp2 = await prisma.player.create({
      data: { name: "O2", email: "o2@x", passwordHash: "x" },
    });
    const earlier = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-14"), playerCount: 4 },
    });
    await prisma.match.create({
      data: {
        gameDayId: earlier.id,
        matchNumber: 1,
        team1PlayerAId: player.id,
        team1PlayerBId: partner.id,
        team2PlayerAId: opp1.id,
        team2PlayerBId: opp2.id,
        team1Score: 3,
        team2Score: 1,
      },
    });

    const use = await useJoker({ playerId: player.id, gameDayId: gameDay.id });
    expect(Number(use.ppgAtUse)).toBeCloseTo(3);
    expect(Number(use.pointsCredited)).toBeCloseTo(3 * JOKER_GAMES_CREDITED);
  });

  it("rejects a third Joker in same season", async () => {
    const { season, player, gameDay } = await setup();
    for (let i = 0; i < MAX_JOKERS_PER_SEASON; i++) {
      const g = await prisma.gameDay.create({
        data: { seasonId: season.id, date: new Date(2026, 3, 21 + i) },
      });
      await prisma.gameDayParticipant.create({
        data: { gameDayId: g.id, playerId: player.id },
      });
      await useJoker({ playerId: player.id, gameDayId: g.id });
    }

    await expect(useJoker({ playerId: player.id, gameDayId: gameDay.id })).rejects.toThrow(
      /max/i,
    );
  });

  it("rejects using a Joker on a locked game day", async () => {
    const { player, gameDay } = await setup();
    await prisma.gameDay.update({
      where: { id: gameDay.id },
      data: { status: "roster_locked" },
    });
    await expect(useJoker({ playerId: player.id, gameDayId: gameDay.id })).rejects.toThrow(
      /locked/i,
    );
  });
});
