import { z } from "zod";

export type ScoringRule = { mode: "fixed"; games: number } | { mode: "set"; target: number; max: number };
export type PlayerCountKey = "4" | "5" | "6";
export type ScoringRules = Record<PlayerCountKey, ScoringRule>;

export const PLAYER_COUNTS: PlayerCountKey[] = ["4", "5", "6"];
export const FIXED_GAMES = [1, 3, 5, 7, 9] as const;
export const SET_TARGET_MIN = 3;
export const SET_TARGET_MAX = 9;
// "höchstens" may exceed "Satz bis" by at most this many games.
export const SET_MAX_EXTRA = 3;

export const DEFAULT_SCORING: ScoringRules = {
  "4": { mode: "set", target: 6, max: 7 },
  "5": { mode: "fixed", games: 3 },
  "6": { mode: "fixed", games: 3 },
};

export const scoringRuleSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("fixed"),
    games: z.number().int().refine((n) => (FIXED_GAMES as readonly number[]).includes(n)),
  }),
  z
    .object({
      mode: z.literal("set"),
      target: z.number().int().min(SET_TARGET_MIN).max(SET_TARGET_MAX),
      max: z.number().int(),
    })
    .refine((r) => r.max >= r.target && r.max <= r.target + SET_MAX_EXTRA),
]);

/** Reads stored rules; missing or invalid entries fall back to the default. */
export function parseScoring(raw: unknown): ScoringRules {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_SCORING };
  for (const k of PLAYER_COUNTS) {
    const r = scoringRuleSchema.safeParse(obj[k]);
    if (r.success) out[k] = r.data;
  }
  return out;
}

export function ruleForPlayerCount(rules: ScoringRules, playerCount: number | null): ScoringRule {
  const key = String(playerCount) as PlayerCountKey;
  return PLAYER_COUNTS.includes(key) ? rules[key] : rules["6"];
}

/** German reason why a score is invalid, or null if it is valid. */
export function invalidReason(rule: ScoringRule, a: number, b: number): string | null {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return "Nur ganze Zahlen ab 0";
  if (rule.mode === "fixed") {
    if (a + b !== rule.games) return `Summe muss ${rule.games} sein (jetzt ${a + b})`;
    if (a === b) return "Unentschieden ist nicht erlaubt";
    return null;
  }
  if (a === b) return "Unentschieden ist nicht erlaubt";
  const w = Math.max(a, b);
  const l = Math.min(a, b);
  if (w < rule.target) return `Gewinner braucht mindestens ${rule.target} Spiele`;
  if (w > rule.max) return `Höchstens ${rule.max} Spiele`;
  // Beyond the target only after a close set, e.g. 7:5 or 7:6 when playing to 6,
  // and the set stays close from there on (8:6 yes, 8:5 no).
  if (w > rule.target && l < rule.target - 1) {
    return `${w} Spiele nur nach ${rule.target}:${rule.target - 1} oder ${rule.target}:${rule.target}`;
  }
  if (w > rule.target && w - l > 2) {
    return `Über ${rule.target} Spiele hinaus nur mit höchstens 2 Spielen Unterschied`;
  }
  return null;
}

export function isValidScore(rule: ScoringRule, a: number, b: number): boolean {
  return invalidReason(rule, a, b) === null;
}

/**
 * True when the score is final as entered, so the court board may save it on
 * its own. Only fixed-sum rules qualify: under set rules a valid 6:4 can still
 * become 6:5 or 7:5.
 */
export function isSettledScore(rule: ScoringRule, a: number, b: number): boolean {
  return rule.mode === "fixed" && isValidScore(rule, a, b);
}

export function canIncrement(rule: ScoringRule, own: number, other: number): boolean {
  return rule.mode === "fixed" ? own + other < rule.games : own < rule.max;
}

export function describeRule(rule: ScoringRule): string {
  if (rule.mode === "fixed") return `${rule.games} ${rule.games === 1 ? "Spiel" : "Spiele"} pro Partie`;
  return rule.max > rule.target ? `Satz bis ${rule.target}, höchstens ${rule.max}` : `Satz bis ${rule.target}`;
}

export function hintFor(rule: ScoringRule): string {
  if (rule.mode === "fixed") {
    const g = rule.games;
    if (g <= 3) {
      const all = Array.from({ length: g + 1 }, (_, i) => `${g - i}:${i}`);
      return `Summe ${g}: ${all.slice(0, -1).join(", ")} oder ${all.at(-1)}`;
    }
    return `Summe ${g}, z. B. ${Math.ceil(g / 2)}:${Math.floor(g / 2)} oder ${g}:0`;
  }
  const t = rule.target;
  const close = rule.max > t ? `${t + 1}:${t}` : `${t}:${Math.max(0, t - 1)}`;
  return `${describeRule(rule)} – z. B. ${t}:${Math.max(0, t - 2)} oder ${close}`;
}

export function examplesFor(rule: ScoringRule): { valid: string[]; invalid: string[] } {
  if (rule.mode === "fixed") {
    const g = rule.games;
    const valid = Array.from({ length: g + 1 }, (_, i) => `${g - i}:${i}`).slice(0, 4);
    const half = Math.ceil(g / 2);
    return { valid, invalid: [`${half}:${half}`, `${g}:1`, `${Math.max(1, g - 1)}:0`] };
  }
  const t = rule.target;
  const valid = [`${t}:0`, `${t}:${Math.max(0, t - 2)}`, `${t}:${t - 1}`];
  if (rule.max > t) valid.push(`${t + 1}:${t - 1}`, `${t + 1}:${t}`);
  const invalid = [`${t}:${t}`, `${t - 1}:${Math.max(0, t - 3)}`, rule.max > t ? `${rule.max + 1}:${t}` : `${t + 1}:${t - 1}`];
  return { valid, invalid };
}

/** Rule a game day was started with; days from before the snapshot fall back to the default. */
export function ruleForGameDay(day: { scoring: unknown; playerCount: number | null }): ScoringRule {
  const stored = scoringRuleSchema.safeParse(day.scoring);
  return stored.success ? stored.data : ruleForPlayerCount(DEFAULT_SCORING, day.playerCount);
}
