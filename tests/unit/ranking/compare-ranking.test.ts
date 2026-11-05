import { describe, it, expect } from "vitest";
import { _compareRankingForTesting as compare } from "@/lib/ranking/season-trend";

describe("compareRanking", () => {
  it("Punkte, dann Schnitt, dann Spieler-ID", () => {
    const rows = [
      { playerId: "c", points: 10, games: 5 },
      { playerId: "b", points: 10, games: 5 },
      { playerId: "a", points: 10, games: 4 },
      { playerId: "d", points: 12, games: 9 },
    ];
    expect([...rows].sort(compare).map((r) => r.playerId)).toEqual(["d", "a", "b", "c"]);
  });
});
