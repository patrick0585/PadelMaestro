import type { MatchFormat } from "@/lib/pairings/types";

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateScore(a: number, b: number, format: MatchFormat): ValidationResult {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    return { ok: false, reason: "Scores must be non-negative integers" };
  }
  if (a === b) {
    return { ok: false, reason: "Ties are not allowed" };
  }
  const target = format === "first-to-3" ? 3 : 6;
  const winner = Math.max(a, b);
  const loser = Math.min(a, b);
  if (winner !== target) {
    return { ok: false, reason: `Winning score must be ${target}` };
  }
  if (loser >= target) {
    return { ok: false, reason: `Losing score must be less than ${target}` };
  }
  return { ok: true };
}
