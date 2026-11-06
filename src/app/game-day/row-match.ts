import type { RowMatch } from "./match-rows";

interface MatchWithNames {
  id: string;
  matchNumber: number;
  team1PlayerA: { name: string };
  team1PlayerB: { name: string };
  team2PlayerA: { name: string };
  team2PlayerB: { name: string };
  team1Score: number | null;
  team2Score: number | null;
  version: number;
  scoredBy: { name: string } | null;
  scoredAt: Date | null;
}

/** Serialisable row for MatchRows; callers decide whether the match can be removed. */
export function toRowMatch(m: MatchWithNames, removable: boolean): RowMatch {
  return {
    id: m.id,
    matchNumber: m.matchNumber,
    team1: [m.team1PlayerA.name, m.team1PlayerB.name],
    team2: [m.team2PlayerA.name, m.team2PlayerB.name],
    team1Score: m.team1Score,
    team2Score: m.team2Score,
    version: m.version,
    scoredByName: m.scoredBy?.name ?? null,
    scoredAt: m.scoredAt?.toISOString() ?? null,
    removable,
  };
}
