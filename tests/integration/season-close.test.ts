import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  closeSeasonAndStartNext,
  getOrCreateActiveSeason,
  InvalidSeasonNamesError,
  NoActiveSeasonError,
  OpenGameDaysError,
  SeasonNameConflictError,
} from "@/lib/season";
import { computeRanking } from "@/lib/ranking/compute";
import { resetDb } from "../helpers/reset-db";

async function makeAdmin() {
  return prisma.player.create({
    data: { name: "Admin", email: "admin@x", passwordHash: "x", isAdmin: true },
  });
}

describe("closeSeasonAndStartNext", () => {
  beforeEach(resetDb);

  it("renames+deactivates the old season, creates a new active one, writes an audit log", async () => {
    const admin = await makeAdmin();
    const season = await getOrCreateActiveSeason();

    const { closedSeason, newSeason } = await closeSeasonAndStartNext({
      closedName: "Hinrunde 2026",
      nextName: "Rückrunde 2026",
      actorId: admin.id,
    });

    expect(closedSeason.id).toBe(season.id);
    expect(closedSeason.name).toBe("Hinrunde 2026");
    expect(closedSeason.isActive).toBe(false);
    expect(newSeason.name).toBe("Rückrunde 2026");
    expect(newSeason.isActive).toBe(true);
    expect(newSeason.id).not.toBe(season.id);

    const active = await prisma.season.findMany({ where: { isActive: true } });
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(newSeason.id);

    const log = await prisma.auditLog.findFirst({ where: { action: "season.close" } });
    expect(log?.entityId).toBe(season.id);
    expect(log?.actorId).toBe(admin.id);
  });

  it("starts the new season with an empty ranking and a fresh joker budget", async () => {
    const admin = await makeAdmin();
    const season = await getOrCreateActiveSeason();
    const players = await Promise.all(
      ["A", "B", "C", "D"].map((n) =>
        prisma.player.create({ data: { name: n, email: `${n}@x`, passwordHash: "x" } }),
      ),
    );
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-07-14"), status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: players[0].id,
        team1PlayerBId: players[1].id,
        team2PlayerAId: players[2].id,
        team2PlayerBId: players[3].id,
        team1Score: 6,
        team2Score: 1,
      },
    });
    await prisma.jokerUse.create({
      data: {
        playerId: players[0].id,
        seasonId: season.id,
        gameDayId: day.id,
        ppgAtUse: 1.5,
        pointsCredited: 15,
      },
    });

    const { newSeason } = await closeSeasonAndStartNext({
      closedName: "Hinrunde 2026",
      nextName: "Rückrunde 2026",
      actorId: admin.id,
    });

    expect(await computeRanking(newSeason.id)).toEqual([]);
    expect(await prisma.jokerUse.count({ where: { seasonId: newSeason.id } })).toBe(0);
    // Alte Saison bleibt vollständig: Ranking weiterhin berechenbar, Joker zugeordnet.
    expect((await computeRanking(season.id)).length).toBeGreaterThan(0);
    expect(await prisma.jokerUse.count({ where: { seasonId: season.id } })).toBe(1);
  });

  it.each(["planned", "in_progress"] as const)(
    "refuses to close while a %s game day exists and changes nothing",
    async (status) => {
      const admin = await makeAdmin();
      const season = await getOrCreateActiveSeason();
      await prisma.gameDay.create({
        data: { seasonId: season.id, date: new Date("2026-07-21"), status },
      });

      await expect(
        closeSeasonAndStartNext({
          closedName: "Hinrunde 2026",
          nextName: "Rückrunde 2026",
          actorId: admin.id,
        }),
      ).rejects.toThrow(OpenGameDaysError);

      const unchanged = await prisma.season.findUniqueOrThrow({ where: { id: season.id } });
      expect(unchanged.isActive).toBe(true);
      expect(await prisma.season.count()).toBe(1);
    },
  );

  it("reports the open days in the error", async () => {
    const admin = await makeAdmin();
    const season = await getOrCreateActiveSeason();
    await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-07-21"), status: "planned" },
    });
    const err = await closeSeasonAndStartNext({
      closedName: "A",
      nextName: "B",
      actorId: admin.id,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(OpenGameDaysError);
    expect((err as OpenGameDaysError).days).toHaveLength(1);
    expect((err as OpenGameDaysError).days[0].status).toBe("planned");
  });

  it("rejects empty or identical names", async () => {
    const admin = await makeAdmin();
    await getOrCreateActiveSeason();
    for (const [closedName, nextName] of [
      ["", "Rückrunde 2026"],
      ["Hinrunde 2026", "   "],
      ["Gleich", "Gleich"],
    ]) {
      await expect(
        closeSeasonAndStartNext({ closedName, nextName, actorId: admin.id }),
      ).rejects.toThrow(InvalidSeasonNamesError);
    }
  });

  it("rejects names already taken by another season", async () => {
    const admin = await makeAdmin();
    const year = new Date().getFullYear();
    await prisma.season.create({
      data: {
        name: "Hinrunde 2026",
        year,
        startDate: new Date(year, 0, 1),
        endDate: new Date(year, 5, 30),
        isActive: false,
      },
    });
    await getOrCreateActiveSeason();
    await expect(
      closeSeasonAndStartNext({
        closedName: "Egal",
        nextName: "Hinrunde 2026",
        actorId: admin.id,
      }),
    ).rejects.toThrow(SeasonNameConflictError);
  });

  it("throws NoActiveSeasonError when no season is active", async () => {
    const admin = await makeAdmin();
    await expect(
      closeSeasonAndStartNext({ closedName: "A", nextName: "B", actorId: admin.id }),
    ).rejects.toThrow(NoActiveSeasonError);
  });
});
