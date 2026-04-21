import type { MatchFormat } from "@/lib/pairings/types";

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateScore(a: number, b: number, format: MatchFormat): ValidationResult {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    return { ok: false, reason: "Scores must be non-negative integers" };
  }
  if (a === b) {
    return { ok: false, reason: "Ties are not allowed" };
  }

  if (format === "sum-to-3") {
    if (a + b !== 3) {
      return { ok: false, reason: "Total points must sum to 3 (e.g. 3:0, 2:1, 1:2, 0:3)" };
    }
    return { ok: true };
  }

  const winner = Math.max(a, b);
  const loser = Math.min(a, b);
  if (winner < 6) {
    return { ok: false, reason: "Winner must reach at least 6" };
  }
  if (winner === 6 && loser > 4) {
    return { ok: false, reason: "At 6:5 play continues until a 2-game lead" };
  }
  if (winner > 6 && loser !== winner - 2) {
    return { ok: false, reason: "After 6:6 the match ends only on a 2-game lead" };
  }
  return { ok: true };
}
