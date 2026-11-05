import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { loadPlayerPass } from "@/lib/profile/player-pass";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGameDay, createTestGroup, createTestSeason } from "../helpers/group";

let groupId: string;

async function finishedDay(seasonId: string, date: string, ids: string[], scores: [number, number]) {
  const day = await createTestGameDay(groupId, seasonId, { date: new Date(`${date}T00:00:00Z`), status: "finished" });
  await prisma.gameDayParticipant.createMany({
    data: ids.map((playerId) => ({ gameDayId: day.id, playerId, attendance: "confirmed" as const })),
  });
  await prisma.match.create({
    data: {
      gameDayId: day.id,
      matchNumber: 1,
      team1PlayerAId: ids[0],
      team1PlayerBId: ids[1],
      team2PlayerAId: ids[2],
      team2PlayerBId: ids[3],
      team1Score: scores[0],
      team2Score: scores[1],
    },
  });
  return day;
}

describe("loadPlayerPass", () => {
  beforeEach(async () => {
    await resetDb();
    groupId = (await createTestGroup()).id;
  });

  it("returns joinedAt as member-since and no stats without games", async () => {
    const me = await createMember(groupId, { name: "Me", email: "me@x" });
    await prisma.membership.updateMany({ where: { playerId: me.id }, data: { joinedAt: new Date("2026-03-01T10:00:00Z") } });
    await createTestSeason(groupId, { name: "Saison 2026" });

    const pass = await loadPlayerPass(me.id, groupId);
    expect(pass.memberSince).toEqual(new Date("2026-03-01T10:00:00Z"));
    expect(pass.seasonName).toBe("Saison 2026");
    expect(pass.stats).toBeNull();
  });

  it("uses the first game day in the group when it predates joinedAt", async () => {
    const players = await Promise.all(["Me", "B", "C", "D"].map((n) => createMember(groupId, { name: n, email: `${n}@x` })));
    const [me] = players;
    const old = await createTestSeason(groupId, { name: "Saison 2025", year: 2025, isActive: false });
    await finishedDay(old.id, "2025-04-10", players.map((p) => p.id), [2, 1]);
    await createTestSeason(groupId, { name: "Saison 2026" });

    const pass = await loadPlayerPass(me.id, groupId);
    expect(pass.memberSince).toEqual(new Date("2025-04-10T00:00:00Z"));
    expect(pass.stats).toBeNull();
  });

  it("returns rank, points per game and attended days for the active season", async () => {
    const players = await Promise.all(["Me", "B", "C", "D"].map((n) => createMember(groupId, { name: n, email: `${n}@x` })));
    const ids = players.map((p) => p.id);
    const season = await createTestSeason(groupId, { name: "Saison 2026" });
    await finishedDay(season.id, "2026-10-01", ids, [3, 0]);
    await finishedDay(season.id, "2026-10-08", [ids[2], ids[3], ids[0], ids[1]], [2, 1]);

    const pass = await loadPlayerPass(ids[0], groupId);
    expect(pass.stats).toEqual({ rank: 1, ppg: 2, attended: 2 });
    const passC = await loadPlayerPass(ids[2], groupId);
    expect(passC.stats).toMatchObject({ ppg: 1, attended: 2 });
  });
  it("returns seasonName null and no stats when the group has no active season", async () => {
    const me = await createMember(groupId, { name: "Me", email: "me@x" });
    await createTestSeason(groupId, { name: "Alt", year: 2025, isActive: false });

    const pass = await loadPlayerPass(me.id, groupId);
    expect(pass.seasonName).toBeNull();
    expect(pass.stats).toBeNull();
    expect(pass.memberSince).toBeInstanceOf(Date);
  });

  it("ignores game days of another group for memberSince", async () => {
    const players = await Promise.all(["Me", "B", "C", "D"].map((n) => createMember(groupId, { name: n, email: `${n}@x` })));
    const other = await createTestGroup("Andere");
    const otherSeason = await createTestSeason(other.id, { name: "Fremd" });
    const prev = groupId;
    groupId = other.id;
    await finishedDay(otherSeason.id, "2020-01-05", players.map((p) => p.id), [2, 1]);
    groupId = prev;
    await prisma.membership.updateMany({
      where: { playerId: players[0].id, groupId },
      data: { joinedAt: new Date("2026-03-01T10:00:00Z") },
    });

    const pass = await loadPlayerPass(players[0].id, groupId);
    expect(pass.memberSince).toEqual(new Date("2026-03-01T10:00:00Z"));
  });

  it("keeps joinedAt when it is earlier than the first game day", async () => {
    const players = await Promise.all(["Me", "B", "C", "D"].map((n) => createMember(groupId, { name: n, email: `${n}@x` })));
    await prisma.membership.updateMany({
      where: { playerId: players[0].id },
      data: { joinedAt: new Date("2024-01-15T00:00:00Z") },
    });
    const season = await createTestSeason(groupId, { name: "Saison 2026" });
    await finishedDay(season.id, "2026-10-01", players.map((p) => p.id), [2, 1]);

    const pass = await loadPlayerPass(players[0].id, groupId);
    expect(pass.memberSince).toEqual(new Date("2024-01-15T00:00:00Z"));
  });

  it("returns null memberSince for a player without membership or game days in the group", async () => {
    const other = await createTestGroup("Andere");
    const stranger = await createMember(other.id, { name: "Fremd", email: "f@x" });
    await createTestSeason(groupId, { name: "Saison 2026" });

    const pass = await loadPlayerPass(stranger.id, groupId);
    expect(pass.memberSince).toBeNull();
    expect(pass.stats).toBeNull();
    expect(pass.seasonName).toBe("Saison 2026");
  });

  it("ranks losers densely and ignores unranked bystanders", async () => {
    const players = await Promise.all(["Me", "B", "C", "D", "E"].map((n) => createMember(groupId, { name: n, email: `${n}@x` })));
    const ids = players.map((p) => p.id);
    const season = await createTestSeason(groupId, { name: "Saison 2026" });
    await finishedDay(season.id, "2026-10-01", ids.slice(0, 4), [0, 3]);

    const loser = await loadPlayerPass(ids[0], groupId);
    expect(loser.stats).toMatchObject({ rank: 2, attended: 1 });
    const bystander = await loadPlayerPass(ids[4], groupId);
    expect(bystander.stats).toBeNull();
  });
});
