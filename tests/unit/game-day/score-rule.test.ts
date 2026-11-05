import { describe, it, expect } from "vitest";
import { scoreRuleFor } from "@/lib/game-day/score-rule";

describe("scoreRuleFor", () => {
  it("5 und 6 Spieler: Summe 3", () => {
    for (const n of [5, 6]) {
      const r = scoreRuleFor(n);
      expect(r.hint).toBe("Summe 3: 3:0, 2:1, 1:2 oder 0:3");
      expect(r.isValid(2, 1)).toBe(true);
      expect(r.isValid(2, 2)).toBe(false);
      expect(r.isValid(3, 1)).toBe(false);
      expect(r.canIncrement(2, 0)).toBe(true);
      expect(r.canIncrement(2, 1)).toBe(false);
      expect(r.canIncrement(0, 3)).toBe(false);
    }
  });

  it("4 Spieler: Satz, Gewinner mindestens 6", () => {
    const r = scoreRuleFor(4);
    expect(r.hint).toBe("Satz: Gewinner mindestens 6 Spiele, z. B. 6:4 oder 7:6");
    expect(r.isValid(7, 6)).toBe(true);
    expect(r.isValid(5, 3)).toBe(false);
    expect(r.isValid(6, 6)).toBe(false);
    expect(r.canIncrement(11, 6)).toBe(true);
    expect(r.canIncrement(12, 6)).toBe(false);
  });

  it("ohne Spielerzahl wie 6 Spieler", () => {
    expect(scoreRuleFor(null).format).toBe("sum-to-3");
  });
});
