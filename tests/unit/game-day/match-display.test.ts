import { describe, it, expect } from "vitest";
import { determineWinner } from "@/lib/game-day/match-display";

describe("determineWinner", () => {
  it("returns team1 when team1 scores higher", () => {
    expect(determineWinner(3, 1)).toBe("team1");
  });

  it("returns team2 when team2 scores higher", () => {
    expect(determineWinner(0, 2)).toBe("team2");
  });

  it("returns null on a tie", () => {
    expect(determineWinner(2, 2)).toBeNull();
  });

  it("returns null when team1 score is null", () => {
    expect(determineWinner(null, 3)).toBeNull();
  });

  it("returns null when team2 score is null", () => {
    expect(determineWinner(3, null)).toBeNull();
  });

  it("returns null when both scores are null", () => {
    expect(determineWinner(null, null)).toBeNull();
  });
});
