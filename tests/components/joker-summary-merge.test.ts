import { describe, it, expect } from "vitest";
import { mergeJokersIntoRows } from "@/app/game-day/joker-summary-merge";
import type { GameDaySummaryRow } from "@/lib/game-day/summary";
import type { JokerUseRow } from "@/lib/joker/list";

function summaryRow(overrides: Partial<GameDaySummaryRow> = {}): GameDaySummaryRow {
  return {
    playerId: "p-played",
    playerName: "Spieler",
    avatarVersion: 0,
    points: 30,
    matches: 3,
    ...overrides,
  };
}

function jokerRow(overrides: Partial<JokerUseRow> = {}): JokerUseRow {
  return {
    playerId: "p-joker",
    playerName: "Joker",
    avatarVersion: 0,
    ppgAtUse: 12.5,
    gamesCredited: 3,
    pointsCredited: 37.5,
    ...overrides,
  };
}

describe("mergeJokersIntoRows", () => {
  it("returns an empty list when both inputs are empty", () => {
    expect(mergeJokersIntoRows([], [])).toEqual([]);
  });

  it("marks summary-derived rows with jokerUsed=false", () => {
    const result = mergeJokersIntoRows([summaryRow()], []);
    expect(result).toHaveLength(1);
    expect(result[0].jokerUsed).toBe(false);
  });

  it("adds joker rows with jokerUsed=true and rounded credited points", () => {
    const result = mergeJokersIntoRows(
      [],
      [jokerRow({ pointsCredited: 37.5, gamesCredited: 3 })],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      jokerUsed: true,
      points: 38,
      matches: 3,
    });
  });

  it("rounds credited points to the nearest integer (half up)", () => {
    const result = mergeJokersIntoRows([], [jokerRow({ pointsCredited: 16.5 })]);
    expect(result[0].points).toBe(17);
  });

  it("sorts merged rows by points desc, then matches desc, then de-locale name", () => {
    const result = mergeJokersIntoRows(
      [
        summaryRow({ playerId: "a", playerName: "Anna", points: 40, matches: 3 }),
        summaryRow({ playerId: "b", playerName: "Bea", points: 30, matches: 3 }),
        summaryRow({ playerId: "z", playerName: "Zoe", points: 30, matches: 4 }),
      ],
      [
        // Joker beats everyone on points → must sort to the top.
        jokerRow({ playerId: "j1", playerName: "Joker1", pointsCredited: 50, gamesCredited: 3 }),
        // Tie on points (30) and matches (3) with Bea → de-locale name order: Bea < Joker2.
        jokerRow({ playerId: "j2", playerName: "Joker2", pointsCredited: 30, gamesCredited: 3 }),
      ],
    );
    expect(result.map((r) => r.playerId)).toEqual(["j1", "a", "z", "b", "j2"]);
  });

  it("does not mutate the input arrays", () => {
    const summary = [summaryRow({ playerName: "B" }), summaryRow({ playerName: "A" })];
    const jokers = [jokerRow({ playerName: "C" })];
    const snapshotSummary = JSON.stringify(summary);
    const snapshotJokers = JSON.stringify(jokers);
    mergeJokersIntoRows(summary, jokers);
    expect(JSON.stringify(summary)).toBe(snapshotSummary);
    expect(JSON.stringify(jokers)).toBe(snapshotJokers);
  });

  it("drops the joker entry when the same playerId already appears in summaryRows", () => {
    // Should never happen in practice (a joker means absence), but guard against
    // React key collisions that would silently drop a row from the DOM.
    const result = mergeJokersIntoRows(
      [summaryRow({ playerId: "dup", playerName: "Anna", points: 30, matches: 3 })],
      [jokerRow({ playerId: "dup", playerName: "Anna", pointsCredited: 30, gamesCredited: 3 })],
    );
    expect(result).toHaveLength(1);
    expect(result[0].jokerUsed).toBe(false);
    expect(result[0].playerId).toBe("dup");
  });

  it("preserves joker details (gamesCredited as matches, avatarVersion, playerId/name)", () => {
    const result = mergeJokersIntoRows(
      [],
      [
        jokerRow({
          playerId: "p-x",
          playerName: "Xenia",
          avatarVersion: 7,
          gamesCredited: 4,
          pointsCredited: 52,
        }),
      ],
    );
    expect(result[0]).toMatchObject({
      playerId: "p-x",
      playerName: "Xenia",
      avatarVersion: 7,
      matches: 4,
      points: 52,
      jokerUsed: true,
    });
  });
});
