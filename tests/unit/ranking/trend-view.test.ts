import { describe, it, expect } from "vitest";
import { gapToLeaderByDay, trendLeaderId } from "@/lib/ranking/trend-view";

const p = (playerId: string, values: (number | null)[], points: (number | null)[]) => ({ playerId, values, points });

describe("trendLeaderId", () => {
  it("is the player ranked 1 after the last day", () => {
    expect(trendLeaderId([p("a", [1, 2], [5, 7]), p("b", [2, 1], [3, 9])])).toBe("b");
  });

  it("prefers more points when the top place is shared", () => {
    expect(trendLeaderId([p("a", [1], [5]), p("b", [1], [5.4])])).toBe("b");
  });

  it("breaks a full tie by player id, independent of input order", () => {
    expect(trendLeaderId([p("z", [1], [5]), p("c", [1], [5])])).toBe("c");
    expect(trendLeaderId([p("c", [1], [5]), p("z", [1], [5])])).toBe("c");
  });

  it("ignores players without a value on the last day", () => {
    expect(trendLeaderId([p("a", [1, null], [5, null]), p("b", [2, 2], [3, 4])])).toBe("b");
  });

  it("is null without days or players", () => {
    expect(trendLeaderId([p("a", [], [])])).toBeNull();
    expect(trendLeaderId([])).toBeNull();
  });
});

describe("gapToLeaderByDay", () => {
  it("returns the rounded point gap to the top of each day", () => {
    const players = [p("a", [1, 1], [10, 20.4]), p("me", [2, 2], [7, 15.6])];
    expect(gapToLeaderByDay(players, "me")).toEqual([
      { gap: 3, first: false },
      { gap: 4, first: false },
    ]);
  });

  it("marks days I was on place 1 and is null before my first appearance", () => {
    const players = [p("a", [1, 2], [4, 8]), p("me", [null, 1], [null, 9])];
    expect(gapToLeaderByDay(players, "me")).toEqual([null, { gap: 0, first: true }]);
  });

  it("does not count equal points on place 2 as leading", () => {
    const players = [p("a", [1], [10.4]), p("me", [2], [10])];
    expect(gapToLeaderByDay(players, "me")).toEqual([{ gap: 0, first: false }]);
  });

  it("treats players without points on a day as 0", () => {
    const players = [p("a", [null, 1], [null, 6]), p("me", [1, 2], [2, 3])];
    expect(gapToLeaderByDay(players, "me")).toEqual([
      { gap: 0, first: true },
      { gap: 3, first: false },
    ]);
  });

  it("is empty when I am not in the trend", () => {
    expect(gapToLeaderByDay([p("a", [1], [4])], "me")).toEqual([]);
  });
});
