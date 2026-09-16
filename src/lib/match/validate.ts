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

  // tennis-set: the winner needs at least 6 games; no minimum lead, so a
  // set may end 6:5 or 7:6 once the group decides to stop.
  if (Math.max(a, b) < 6) {
    return { ok: false, reason: "Winner must reach at least 6" };
  }
  return { ok: true };
}
