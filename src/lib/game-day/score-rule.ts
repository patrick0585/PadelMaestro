import type { MatchFormat } from "@/lib/pairings/types";
import { validateScore } from "@/lib/match/validate";

export interface ScoreRule {
  format: MatchFormat;
  hint: string;
  isValid: (a: number, b: number) => boolean;
  /** Whether one side may still go up by one, given the side's value and the other's. */
  canIncrement: (own: number, other: number) => boolean;
}

/** Mirrors enter-score.ts: 4 players play a set, 5 and 6 play matches summing to 3. */
export function scoreRuleFor(playerCount: number | null): ScoreRule {
  const format: MatchFormat = playerCount === 4 ? "tennis-set" : "sum-to-3";
  const max = format === "tennis-set" ? 12 : 3;
  return {
    format,
    hint:
      format === "tennis-set"
        ? "Satz: Gewinner mindestens 6 Spiele, z. B. 6:4 oder 7:6"
        : "Summe 3: 3:0, 2:1, 1:2 oder 0:3",
    isValid: (a, b) => validateScore(a, b, format).ok,
    canIncrement: (own, other) => (format === "sum-to-3" ? own + other < max : own < max),
  };
}
