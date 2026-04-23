import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { listJokersForGameDay } from "@/lib/joker/list";
import { resetDb } from "../helpers/reset-db";

async function makeSeason(year = new Date().getFullYear()) {
  return prisma.season.create({
    data: {
      year,
      startDate: new Date(year, 0, 1),
      endDate: new Date(year, 11, 31),
      isActive: true,
    },
  });
}

async function makePlayer(name: string) {
  return prisma.player.create({
    data: { name, email: `${name.toLowerCase()}@x`, passwordHash: "x" },
  });
}

describe("listJokersForGameDay", () => {
  beforeEach(resetDb);

  it("returns an empty array when no joker was used on that day", async () => {
    const season = await makeSeason(2026);
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), status: "planned" },
    });
    expect(await listJokersForGameDay(day.id)).toEqual([]);
  });

  it("returns one row per JokerUse, with player details and numeric decimals", async () => {
    const season = await makeSeason(2026);
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), status: "planned" },
    });
    const werner = await makePlayer("Werner");
    await prisma.jokerUse.create({
      data: {
        playerId: werner.id,
        seasonId: season.id,
        gameDayId: day.id,
        ppgAtUse: "1.640",
        gamesCredited: 10,
        pointsCredited: "16.40",
      },
    });

    const rows = await listJokersForGameDay(day.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      playerId: werner.id,
      playerName: "Werner",
      gamesCredited: 10,
    });
    expect(rows[0].ppgAtUse).toBeCloseTo(1.64);
    expect(rows[0].pointsCredited).toBeCloseTo(16.4);
    expect(typeof rows[0].ppgAtUse).toBe("number");
    expect(typeof rows[0].pointsCredited).toBe("number");
  });

  it("sorts rows alphabetically by player name with de collation", async () => {
    const season = await makeSeason(2026);
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), status: "planned" },
    });
    // Includes an umlaut name so the "de" locale sort is actually exercised:
    // under default/en collation Ö would sort after Z, under "de" it sorts like O.
    const [zoe, anna, oezlem, mike] = await Promise.all(
      ["Zoe", "Anna", "Özlem", "Mike"].map(makePlayer),
    );
    for (const p of [zoe, anna, oezlem, mike]) {
      await prisma.jokerUse.create({
        data: {
          playerId: p.id,
          seasonId: season.id,
          gameDayId: day.id,
          ppgAtUse: "1.000",
          gamesCredited: 10,
          pointsCredited: "10.00",
        },
      });
    }
    const names = (await listJokersForGameDay(day.id)).map((r) => r.playerName);
    expect(names).toEqual(["Anna", "Mike", "Özlem", "Zoe"]);
  });

  it("ignores JokerUse rows from other game days", async () => {
    const season = await makeSeason(2026);
    const day1 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), status: "planned" },
    });
    const day2 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-28"), status: "planned" },
    });
    const werner = await makePlayer("Werner");
    await prisma.jokerUse.create({
      data: {
        playerId: werner.id,
        seasonId: season.id,
        gameDayId: day2.id,
        ppgAtUse: "1.000",
        gamesCredited: 10,
        pointsCredited: "10.00",
      },
    });
    expect(await listJokersForGameDay(day1.id)).toEqual([]);
  });
});
