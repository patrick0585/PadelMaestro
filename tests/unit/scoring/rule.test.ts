import { describe, it, expect } from "vitest";
import {
  DEFAULT_SCORING,
  canIncrement,
  describeRule,
  examplesFor,
  hintFor,
  invalidReason,
  isValidScore,
  parseScoring,
  ruleForPlayerCount,
  scoringRuleSchema,
  type ScoringRule,
} from "@/lib/scoring/rule";

const fixed3: ScoringRule = { mode: "fixed", games: 3 };
const set67: ScoringRule = { mode: "set", target: 6, max: 7 };
const set6: ScoringRule = { mode: "set", target: 6, max: 6 };

describe("Wertung", () => {
  it("Standard: 4 Spieler Satz bis 6 höchstens 7, 5 und 6 Spieler 3 Spiele", () => {
    expect(DEFAULT_SCORING).toEqual({ "4": set67, "5": fixed3, "6": fixed3 });
    expect(ruleForPlayerCount(DEFAULT_SCORING, 4)).toEqual(set67);
    expect(ruleForPlayerCount(DEFAULT_SCORING, null)).toEqual(fixed3);
  });

  it("feste Spielzahl: Summe muss stimmen, kein Unentschieden", () => {
    for (const [a, b] of [[3, 0], [2, 1], [1, 2], [0, 3]]) expect(isValidScore(fixed3, a, b)).toBe(true);
    for (const [a, b] of [[2, 2], [3, 1], [2, 0], [0, 0]]) expect(isValidScore(fixed3, a, b)).toBe(false);
    expect(isValidScore({ mode: "fixed", games: 5 }, 3, 2)).toBe(true);
  });

  it("Satz bis 6, höchstens 7", () => {
    for (const [a, b] of [[6, 0], [6, 4], [6, 5], [7, 5], [7, 6], [5, 7]]) expect(isValidScore(set67, a, b)).toBe(true);
    for (const [a, b] of [[6, 6], [5, 3], [8, 6], [7, 4], [7, 7]]) expect(isValidScore(set67, a, b)).toBe(false);
  });

  it("Satz bis 6 ohne Verlängerung", () => {
    expect(isValidScore(set6, 6, 5)).toBe(true);
    expect(isValidScore(set6, 7, 6)).toBe(false);
  });

  it("über „Satz bis“ hinaus nur knapp: höchstens 2 Spiele Unterschied", () => {
    const set68: ScoringRule = { mode: "set", target: 6, max: 8 };
    for (const [a, b] of [[8, 6], [8, 7], [7, 5], [7, 6]]) expect(isValidScore(set68, a, b)).toBe(true);
    for (const [a, b] of [[8, 5], [7, 4], [9, 7]]) expect(isValidScore(set68, a, b)).toBe(false);
    expect(invalidReason(set68, 8, 5)).toBe("Über 6 Spiele hinaus nur mit höchstens 2 Spielen Unterschied");
  });

  it("negative oder krumme Werte sind ungültig", () => {
    expect(isValidScore(fixed3, -1, 4)).toBe(false);
    expect(isValidScore(set67, 6.5, 2)).toBe(false);
  });

  it("Grund für ungültige Ergebnisse", () => {
    expect(invalidReason(fixed3, 1, 1)).toBe("Summe muss 3 sein (jetzt 2)");
    expect(invalidReason(set67, 6, 6)).toBe("Unentschieden ist nicht erlaubt");
    expect(invalidReason(set67, 5, 3)).toBe("Gewinner braucht mindestens 6 Spiele");
    expect(invalidReason(set67, 8, 6)).toBe("Höchstens 7 Spiele");
    expect(invalidReason(set67, 7, 4)).toBe("7 Spiele nur nach 6:5 oder 6:6");
    expect(invalidReason(set67, 7, 5)).toBeNull();
  });

  it("Plus-Sperre", () => {
    expect(canIncrement(fixed3, 2, 0)).toBe(true);
    expect(canIncrement(fixed3, 2, 1)).toBe(false);
    expect(canIncrement(set67, 6, 3)).toBe(true);
    expect(canIncrement(set67, 7, 3)).toBe(false);
  });

  it("Beschreibung, Hinweis und Beispiele", () => {
    expect(describeRule(fixed3)).toBe("3 Spiele pro Partie");
    expect(describeRule(set67)).toBe("Satz bis 6, höchstens 7");
    expect(describeRule(set6)).toBe("Satz bis 6");
    expect(hintFor(fixed3)).toBe("Summe 3: 3:0, 2:1, 1:2 oder 0:3");
    expect(hintFor({ mode: "fixed", games: 7 })).toBe("Summe 7, z. B. 4:3 oder 7:0");
    expect(hintFor(set67)).toBe("Satz bis 6, höchstens 7 – z. B. 6:4 oder 7:6");
    expect(examplesFor(fixed3)).toEqual({ valid: ["3:0", "2:1", "1:2", "0:3"], invalid: ["2:2", "3:1", "2:0"] });
    expect(examplesFor(set67)).toEqual({ valid: ["6:0", "6:4", "6:5", "7:5", "7:6"], invalid: ["6:6", "5:3", "8:6"] });
    expect(examplesFor(set6)).toEqual({ valid: ["6:0", "6:4", "6:5"], invalid: ["6:6", "5:3", "7:5"] });
  });

  it("Schema: nur ungerade Spielzahl, höchstens nicht unter Satz bis", () => {
    expect(scoringRuleSchema.safeParse({ mode: "fixed", games: 4 }).success).toBe(false);
    expect(scoringRuleSchema.safeParse({ mode: "fixed", games: 5 }).success).toBe(true);
    expect(scoringRuleSchema.safeParse({ mode: "set", target: 6, max: 5 }).success).toBe(false);
    expect(scoringRuleSchema.safeParse({ mode: "set", target: 6, max: 10 }).success).toBe(false);
    expect(scoringRuleSchema.safeParse({ mode: "frei" }).success).toBe(false);
    expect(scoringRuleSchema.safeParse({ mode: "set", target: 2, max: 2 }).success).toBe(false);
    expect(scoringRuleSchema.safeParse({ mode: "set", target: 3, max: 4 }).success).toBe(true);
  });

  it("parseScoring ergänzt fehlende oder kaputte Einträge mit dem Standard", () => {
    expect(parseScoring({ "5": { mode: "fixed", games: 5 }, "6": { mode: "x" } })).toEqual({
      "4": set67,
      "5": { mode: "fixed", games: 5 },
      "6": fixed3,
    });
    expect(parseScoring(null)).toEqual(DEFAULT_SCORING);
  });
});
