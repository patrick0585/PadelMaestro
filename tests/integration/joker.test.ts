import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { recordJokerUse, recordJokerUseAsAdmin, cancelJokerUse, cancelJokerUseAsAdmin, JokerNotFoundError, JOKER_GAMES_CREDITED, MAX_JOKERS_PER_SEASON } from "@/lib/joker/use";
import { resetDb } from "../helpers/reset-db";

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

describe("recordJokerUse", () => {
  beforeEach(resetDb);

  it("creates a JokerUse with a ppg snapshot and marks attendance=joker", async () => {
    const { player, gameDay } = await setup();
    const use = await recordJokerUse({ playerId: player.id, gameDayId: gameDay.id });

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

    const use = await recordJokerUse({ playerId: player.id, gameDayId: gameDay.id });
    expect(Number(use.ppgAtUse)).toBeCloseTo(3);
    expect(Number(use.pointsCredited)).toBeCloseTo(3 * JOKER_GAMES_CREDITED);
  });

  it("rejects a third Joker in same season", async () => {
    const { season, player, gameDay } = await setup();
    for (let i = 0; i < MAX_JOKERS_PER_SEASON; i++) {
      const g = await prisma.gameDay.create({
        data: { seasonId: season.id, date: new Date(`2026-04-${22 + i}`) },
      });
      await prisma.gameDayParticipant.create({
        data: { gameDayId: g.id, playerId: player.id },
      });
      await recordJokerUse({ playerId: player.id, gameDayId: g.id });
    }

    await expect(recordJokerUse({ playerId: player.id, gameDayId: gameDay.id })).rejects.toThrow(
      /max/i,
    );
  });

  it("rejects using a Joker on a locked game day", async () => {
    const { player, gameDay } = await setup();
    await prisma.gameDay.update({
      where: { id: gameDay.id },
      data: { status: "in_progress" },
    });
    await expect(recordJokerUse({ playerId: player.id, gameDayId: gameDay.id })).rejects.toThrow(
      /locked/i,
    );
  });

  it("enforces the season cap atomically under concurrent requests", async () => {
    const { season, player } = await setup();
    const days = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        prisma.gameDay.create({
          data: {
            seasonId: season.id,
            date: new Date(`2026-05-0${i + 1}`),
            status: "planned",
          },
        }),
      ),
    );
    await Promise.all(
      days.map((d) =>
        prisma.gameDayParticipant.create({
          data: { gameDayId: d.id, playerId: player.id, attendance: "pending" },
        }),
      ),
    );

    const results = await Promise.allSettled(
      days.map((d) => recordJokerUse({ playerId: player.id, gameDayId: d.id })),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const capErrors = results.filter(
      (r) => r.status === "rejected" && /max/i.test(String(r.reason)),
    ).length;

    expect(ok).toBe(MAX_JOKERS_PER_SEASON);
    expect(capErrors).toBe(5 - MAX_JOKERS_PER_SEASON);
    expect(await prisma.jokerUse.count({ where: { playerId: player.id } })).toBe(
      MAX_JOKERS_PER_SEASON,
    );
  });
});

describe("cancelJokerUse", () => {
  beforeEach(resetDb);

  it("deletes the JokerUse, resets attendance to pending, and writes an audit log", async () => {
    const { player, gameDay } = await setup();
    await recordJokerUse({ playerId: player.id, gameDayId: gameDay.id });

    await cancelJokerUse({ playerId: player.id, gameDayId: gameDay.id });

    const uses = await prisma.jokerUse.count({ where: { playerId: player.id } });
    expect(uses).toBe(0);

    const part = await prisma.gameDayParticipant.findUniqueOrThrow({
      where: { gameDayId_playerId: { gameDayId: gameDay.id, playerId: player.id } },
    });
    expect(part.attendance).toBe("pending");

    const logs = await prisma.auditLog.findMany({
      where: { actorId: player.id, action: "joker.cancel" },
    });
    expect(logs).toHaveLength(1);
    expect((logs[0].payload as { targetPlayerId: string }).targetPlayerId).toBe(player.id);
  });

  it("throws JokerLockedError when the game day is no longer planned", async () => {
    const { player, gameDay } = await setup();
    await prisma.gameDay.update({
      where: { id: gameDay.id },
      data: { status: "in_progress" },
    });
    await expect(
      cancelJokerUse({ playerId: player.id, gameDayId: gameDay.id }),
    ).rejects.toThrow(/locked/i);
  });

  it("throws JokerNotFoundError when no joker is set", async () => {
    const { player, gameDay } = await setup();
    await expect(
      cancelJokerUse({ playerId: player.id, gameDayId: gameDay.id }),
    ).rejects.toBeInstanceOf(JokerNotFoundError);
  });
});

describe("recordJokerUseAsAdmin", () => {
  beforeEach(resetDb);

  it("records a JokerUse with actorId=admin and audit action joker.use.admin", async () => {
    const { season, player, gameDay } = await setup();
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "a@x", passwordHash: "x", isAdmin: true },
    });

    const use = await recordJokerUseAsAdmin({
      actorId: admin.id,
      playerId: player.id,
      gameDayId: gameDay.id,
    });

    expect(use.gamesCredited).toBe(JOKER_GAMES_CREDITED);
    expect(Number(use.ppgAtUse)).toBe(0);
    expect(Number(use.pointsCredited)).toBe(0);

    const log = await prisma.auditLog.findFirst({
      where: { action: "joker.use.admin" },
    });
    expect(log?.actorId).toBe(admin.id);
    expect((log?.payload as { targetPlayerId: string }).targetPlayerId).toBe(player.id);
    expect((log?.payload as { seasonId: string }).seasonId).toBe(season.id);
  });

  it("rejects when the cap is already reached", async () => {
    const { season, player, gameDay } = await setup();
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "a2@x", passwordHash: "x", isAdmin: true },
    });
    for (let i = 0; i < MAX_JOKERS_PER_SEASON; i++) {
      const g = await prisma.gameDay.create({
        data: { seasonId: season.id, date: new Date(`2026-04-${22 + i}`) },
      });
      await prisma.gameDayParticipant.create({
        data: { gameDayId: g.id, playerId: player.id },
      });
      await recordJokerUse({ playerId: player.id, gameDayId: g.id });
    }
    await expect(
      recordJokerUseAsAdmin({ actorId: admin.id, playerId: player.id, gameDayId: gameDay.id }),
    ).rejects.toThrow(/max/i);
  });
});

describe("cancelJokerUseAsAdmin", () => {
  beforeEach(resetDb);

  it("cancels the joker and writes audit action joker.cancel.admin", async () => {
    const { player, gameDay } = await setup();
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "ac@x", passwordHash: "x", isAdmin: true },
    });
    await recordJokerUse({ playerId: player.id, gameDayId: gameDay.id });

    await cancelJokerUseAsAdmin({
      actorId: admin.id,
      playerId: player.id,
      gameDayId: gameDay.id,
    });

    const uses = await prisma.jokerUse.count({ where: { playerId: player.id } });
    expect(uses).toBe(0);
    const part = await prisma.gameDayParticipant.findUniqueOrThrow({
      where: { gameDayId_playerId: { gameDayId: gameDay.id, playerId: player.id } },
    });
    expect(part.attendance).toBe("pending");
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "joker.cancel.admin" },
    });
    expect(log.actorId).toBe(admin.id);
    expect((log.payload as { targetPlayerId: string }).targetPlayerId).toBe(player.id);
  });
});
