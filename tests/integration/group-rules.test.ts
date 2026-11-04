import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import {
  createMember,
  createTestGameDay,
  createTestGroup,
  createTestSeason,
} from "../helpers/group";
import {
  DEFAULT_JOKERS_PER_SEASON,
  DEFAULT_JOKER_GAMES_CREDITED,
  getGroupRules,
} from "@/lib/group/rules";
import { JokerCapExceededError, recordJokerUse } from "@/lib/joker/use";
import { computePlayerSeasonStats } from "@/lib/player/season-stats";
import { loadPlannedGameDay } from "@/lib/admin/game-days";

async function setup(rules: { jokersPerSeason?: number; jokerGamesCredited?: number } = {}) {
  const group = await createTestGroup();
  if (Object.keys(rules).length > 0) {
    await prisma.group.update({ where: { id: group.id }, data: rules });
  }
  const season = await createTestSeason(group.id);
  const player = await createMember(group.id, { name: "P", email: "p@x", passwordHash: "x" });
  return { group, season, player };
}

async function plannedDay(groupId: string, seasonId: string, playerId: string, day: number) {
  const gd = await createTestGameDay(groupId, seasonId, {
    date: new Date(Date.UTC(2026, 3, day)),
  });
  await prisma.gameDayParticipant.create({
    data: { gameDayId: gd.id, playerId, attendance: "pending" },
  });
  return gd;
}

describe("group joker rules", () => {
  beforeEach(resetDb);

  it("gives a new group the defaults 2/15", async () => {
    const group = await createTestGroup();
    expect(await getGroupRules(group.id)).toEqual({ jokersPerSeason: 2, jokerGamesCredited: 15 });
    expect(DEFAULT_JOKERS_PER_SEASON).toBe(2);
    expect(DEFAULT_JOKER_GAMES_CREDITED).toBe(15);
  });

  it("allows a third joker when jokersPerSeason is 3", async () => {
    const { group, season, player } = await setup({ jokersPerSeason: 3 });
    for (let d = 1; d <= 3; d++) {
      const gd = await plannedDay(group.id, season.id, player.id, d);
      await recordJokerUse({ playerId: player.id, gameDayId: gd.id });
    }
    expect(await prisma.jokerUse.count({ where: { playerId: player.id } })).toBe(3);
  });

  it("rejects the second joker when jokersPerSeason is 1", async () => {
    const { group, season, player } = await setup({ jokersPerSeason: 1 });
    const a = await plannedDay(group.id, season.id, player.id, 1);
    const b = await plannedDay(group.id, season.id, player.id, 2);
    await recordJokerUse({ playerId: player.id, gameDayId: a.id });
    await expect(recordJokerUse({ playerId: player.id, gameDayId: b.id })).rejects.toBeInstanceOf(
      JokerCapExceededError,
    );
  });

  it("rejects the first joker when jokersPerSeason is 0", async () => {
    const { group, season, player } = await setup({ jokersPerSeason: 0 });
    const a = await plannedDay(group.id, season.id, player.id, 1);
    await expect(recordJokerUse({ playerId: player.id, gameDayId: a.id })).rejects.toBeInstanceOf(
      JokerCapExceededError,
    );
  });

  it("credits jokerGamesCredited games and games x ppg points", async () => {
    const { group, season, player } = await setup({ jokerGamesCredited: 10 });
    const gd = await plannedDay(group.id, season.id, player.id, 1);
    const use = await recordJokerUse({ playerId: player.id, gameDayId: gd.id });
    expect(use.gamesCredited).toBe(10);
    expect(Number(use.pointsCredited)).toBeCloseTo(10 * Number(use.ppgAtUse), 1);
  });

  it("season stats jokers.total follows the group value", async () => {
    const { season, player } = await setup({ jokersPerSeason: 4 });
    const stats = await computePlayerSeasonStats(player.id, season.id);
    expect(stats.jokers).toEqual({ used: 0, remaining: 4, total: 4 });
  });

  it("roster jokersRemaining follows the group value", async () => {
    const { group, season, player } = await setup({ jokersPerSeason: 5 });
    const gd = await plannedDay(group.id, season.id, player.id, 1);
    const result = await loadPlannedGameDay(group.id, gd.id);
    if (result?.kind !== "planned") throw new Error("expected planned");
    expect(result.roster.find((r) => r.playerId === player.id)?.jokersRemaining).toBe(5);
  });

  it("keeps existing JokerUse credits when the group rule changes later", async () => {
    const { group, season, player } = await setup({ jokerGamesCredited: 10 });
    const others = await Promise.all(
      ["B", "C", "D"].map((n) =>
        createMember(group.id, { name: n, email: `${n}@x`, passwordHash: "x" }),
      ),
    );
    const earlier = await createTestGameDay(group.id, season.id, {
      date: new Date(Date.UTC(2026, 2, 1)),
      status: "finished",
    });
    await prisma.match.create({
      data: {
        gameDayId: earlier.id,
        matchNumber: 1,
        team1PlayerAId: player.id,
        team1PlayerBId: others[0].id,
        team2PlayerAId: others[1].id,
        team2PlayerBId: others[2].id,
        team1Score: 3,
        team2Score: 1,
      },
    });
    const gd = await plannedDay(group.id, season.id, player.id, 1);
    const use = await recordJokerUse({ playerId: player.id, gameDayId: gd.id });
    expect(Number(use.ppgAtUse)).toBeGreaterThan(0);

    await prisma.group.update({ where: { id: group.id }, data: { jokerGamesCredited: 5 } });

    const after = await prisma.jokerUse.findUniqueOrThrow({ where: { id: use.id } });
    expect(after.gamesCredited).toBe(10);
    expect(Number(after.pointsCredited)).toBeCloseTo(10 * Number(after.ppgAtUse), 2);
    expect(Number(after.pointsCredited)).toBeGreaterThan(0);
  });
});
