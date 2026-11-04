import { describe, it, expect } from "vitest";
import { assignRanks, rankingModeFor } from "@/lib/game-day/competition-rank";

const row = (points: number, matches: number) => ({ points, matches });

describe("assignRanks", () => {
  it("returns an empty list for no rows", () => {
    expect(assignRanks([], "competition")).toEqual([]);
    expect(assignRanks([], "dense")).toEqual([]);
  });

  it("numbers strictly ordered rows 1..n in both modes", () => {
    const rows = [row(10, 2), row(8, 2), row(3, 2)];
    expect(assignRanks(rows, "competition")).toEqual([1, 2, 3]);
    expect(assignRanks(rows, "dense")).toEqual([1, 2, 3]);
  });

  it("competition: shares the rank and skips the following ranks (1, 1, 3)", () => {
    expect(assignRanks([row(26, 14), row(26, 14), row(21, 14)], "competition")).toEqual([1, 1, 3]);
  });

  it("dense: shares the rank and continues with the next rank (1, 1, 2)", () => {
    expect(assignRanks([row(26, 14), row(26, 14), row(21, 14)], "dense")).toEqual([1, 1, 2]);
  });

  it("treats equal points with different match counts as distinct ranks", () => {
    expect(assignRanks([row(10, 3), row(10, 4)], "competition")).toEqual([1, 2]);
    expect(assignRanks([row(10, 3), row(10, 4)], "dense")).toEqual([1, 2]);
  });

  it("handles ties lower down the table", () => {
    const rows = [row(10, 1), row(5, 1), row(5, 1), row(0, 1)];
    expect(assignRanks(rows, "competition")).toEqual([1, 2, 2, 4]);
    expect(assignRanks(rows, "dense")).toEqual([1, 2, 2, 3]);
  });
});

describe("rankingModeFor", () => {
  it("uses competition ranking for game days before 2026-11-03", () => {
    expect(rankingModeFor(new Date("2026-11-02T00:00:00Z"))).toBe("competition");
    expect(rankingModeFor(new Date("2026-01-20T00:00:00Z"))).toBe("competition");
  });

  it("uses dense ranking from 2026-11-03 on", () => {
    expect(rankingModeFor(new Date("2026-11-03T00:00:00Z"))).toBe("dense");
    expect(rankingModeFor(new Date("2027-05-01T00:00:00Z"))).toBe("dense");
  });
});
