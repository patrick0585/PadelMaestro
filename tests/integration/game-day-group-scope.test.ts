import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { findGroupGameDay, findGroupMatchGameDay } from "@/lib/game-day/group-scope";
import {
  createMember,
  createTestGameDay,
  createTestGroup,
  createTestSeason,
} from "../helpers/group";
import { resetDb } from "../helpers/reset-db";

describe("game-day group scope", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("findGroupGameDay liefert den Spieltag der eigenen Gruppe", async () => {
    const group = await createTestGroup();
    const season = await createTestSeason(group.id);
    const day = await createTestGameDay(group.id, season.id);
    expect(await findGroupGameDay(group.id, day.id)).toEqual({ id: day.id, status: "planned" });
  });

  it("findGroupGameDay liefert null für Spieltag einer anderen Gruppe", async () => {
    const group = await createTestGroup();
    const other = await createTestGroup("Andere");
    const season = await createTestSeason(other.id);
    const day = await createTestGameDay(other.id, season.id);
    expect(await findGroupGameDay(group.id, day.id)).toBeNull();
  });

  it("findGroupMatchGameDay liefert gameDayId nur für Match der eigenen Gruppe", async () => {
    const group = await createTestGroup();
    const other = await createTestGroup("Andere");
    const season = await createTestSeason(group.id);
    const day = await createTestGameDay(group.id, season.id);
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const p = await createMember(group.id, { name: `P${i}`, email: `p${i}@x.de` });
      ids.push(p.id);
    }
    const match = await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: ids[0],
        team1PlayerBId: ids[1],
        team2PlayerAId: ids[2],
        team2PlayerBId: ids[3],
      },
    });
    expect(await findGroupMatchGameDay(group.id, match.id)).toEqual({ gameDayId: day.id });
    expect(await findGroupMatchGameDay(other.id, match.id)).toBeNull();
  });
});
