export interface LiveMatchInput {
  matchNumber: number;
  team1: [string, string];
  team2: [string, string];
  team1Score: number | null;
  team2Score: number | null;
}

export type Segment = "done" | "current" | "open";

type Names = [string, string];

export interface LiveTicket {
  total: number;
  segments: Segment[];
  currentNumber: number | null;
  last: { matchNumber: number; team1: Names; team2: Names; score: [number, number] } | null;
  current: { matchNumber: number; team1: Names; team2: Names } | null;
}

export function deriveLiveTicket(
  matches: LiveMatchInput[],
  nameById: Record<string, string>,
): LiveTicket {
  const sorted = [...matches].sort((a, b) => a.matchNumber - b.matchNumber);
  const isScored = (m: LiveMatchInput) => m.team1Score !== null && m.team2Score !== null;
  const names = (ids: [string, string]): Names => [nameById[ids[0]] ?? "?", nameById[ids[1]] ?? "?"];

  const currentMatch = sorted.find((m) => !isScored(m)) ?? null;
  const lastMatch = [...sorted].reverse().find(isScored) ?? null;

  return {
    total: sorted.length,
    segments: sorted.map((m) => (isScored(m) ? "done" : m === currentMatch ? "current" : "open")),
    currentNumber: currentMatch?.matchNumber ?? null,
    last: lastMatch
      ? {
          matchNumber: lastMatch.matchNumber,
          team1: names(lastMatch.team1),
          team2: names(lastMatch.team2),
          score: [lastMatch.team1Score as number, lastMatch.team2Score as number],
        }
      : null,
    current: currentMatch
      ? { matchNumber: currentMatch.matchNumber, team1: names(currentMatch.team1), team2: names(currentMatch.team2) }
      : null,
  };
}
