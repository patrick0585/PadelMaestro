import { describe, it, expect } from "vitest";
import { assignCompetitionRanks } from "@/lib/game-day/competition-rank";

const row = (points: number, matches: number) => ({ points, matches });

describe("assignCompetitionRanks", () => {
  it("returns an empty list for no rows", () => {
    expect(assignCompetitionRanks([])).toEqual([]);
  });

  it("numbers strictly ordered rows 1..n", () => {
    expect(assignCompetitionRanks([row(10, 2), row(8, 2), row(3, 2)])).toEqual([1, 2, 3]);
  });

  it("shares the rank on equal points + matches and skips the following ranks (1, 1, 3)", () => {
    expect(assignCompetitionRanks([row(26, 14), row(26, 14), row(21, 14)])).toEqual([1, 1, 3]);
  });

  it("treats equal points with different match counts as distinct ranks", () => {
    expect(assignCompetitionRanks([row(10, 3), row(10, 4)])).toEqual([1, 2]);
  });

  it("handles ties lower down the table (1, 2, 2, 4)", () => {
    expect(assignCompetitionRanks([row(10, 1), row(5, 1), row(5, 1), row(0, 1)])).toEqual([1, 2, 2, 4]);
  });
});
