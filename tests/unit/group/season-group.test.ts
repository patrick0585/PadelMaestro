import { describe, it, expect, beforeEach } from "vitest";
import { getSeasonGroupId } from "@/lib/group/season-group";
import { resetDb } from "../../helpers/reset-db";
import { createTestGroup, createTestSeason } from "../../helpers/group";

describe("getSeasonGroupId", () => {
  beforeEach(resetDb);

  it("returns the groupId of the season", async () => {
    const group = await createTestGroup();
    await createTestGroup("Andere");
    const season = await createTestSeason(group.id);
    await expect(getSeasonGroupId(season.id)).resolves.toBe(group.id);
  });

  it("throws for an unknown season id", async () => {
    await expect(getSeasonGroupId("00000000-0000-0000-0000-000000000000")).rejects.toThrow();
  });
});
