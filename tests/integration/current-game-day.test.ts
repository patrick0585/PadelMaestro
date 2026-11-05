import { describe, it, expect, beforeEach } from "vitest";
import { findCurrentGameDayId } from "@/lib/game-day/current";
import { resetDb } from "../helpers/reset-db";
import { createTestGameDay, createTestGroup, createTestSeason } from "../helpers/group";

let groupId: string;
let seasonId: string;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("findCurrentGameDayId", () => {
  beforeEach(async () => {
    await resetDb();
    groupId = (await createTestGroup()).id;
    seasonId = (await createTestSeason(groupId)).id;
  });

  it("prefers a running day over a later planned one", async () => {
    const running = await createTestGameDay(groupId, seasonId, { date: day("2026-11-05"), status: "in_progress" });
    await createTestGameDay(groupId, seasonId, { date: day("2026-11-12"), status: "planned" });
    expect(await findCurrentGameDayId(groupId)).toBe(running.id);
  });

  it("picks the next planned day when nothing is running", async () => {
    await createTestGameDay(groupId, seasonId, { date: day("2026-11-19"), status: "planned" });
    const next = await createTestGameDay(groupId, seasonId, { date: day("2026-11-12"), status: "planned" });
    expect(await findCurrentGameDayId(groupId)).toBe(next.id);
  });

  it("ignores finished days and other groups", async () => {
    await createTestGameDay(groupId, seasonId, { date: day("2026-11-05"), status: "finished" });
    const other = await createTestGroup("Andere");
    const otherSeason = await createTestSeason(other.id);
    await createTestGameDay(other.id, otherSeason.id, { date: day("2026-11-06"), status: "in_progress" });
    expect(await findCurrentGameDayId(groupId)).toBeNull();
  });
});
