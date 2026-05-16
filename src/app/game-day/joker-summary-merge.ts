import type { GameDaySummaryRow } from "@/lib/game-day/summary";
import type { JokerUseRow } from "@/lib/joker/list";

export interface DisplayRow {
  playerId: string;
  playerName: string;
  avatarVersion: number;
  points: number;
  matches: number;
  jokerUsed: boolean;
}

// Display-only merge: keep summary.ts (and its ranking/archive consumers) untouched.
// Sort matches the tiebreaker in computeGameDaySummary so non-joker order is preserved.
export function mergeJokersIntoRows(
  summaryRows: ReadonlyArray<GameDaySummaryRow>,
  jokers: ReadonlyArray<JokerUseRow>,
): DisplayRow[] {
  // Defensive: domain rules forbid a player from both playing and taking a joker
  // on the same day, but if it ever happens, prefer the played row and drop the
  // joker — otherwise both rows would share a React key and one would silently
  // disappear from the DOM.
  const playedIds = new Set(summaryRows.map((r) => r.playerId));
  const rows: DisplayRow[] = [
    ...summaryRows.map((r) => ({
      playerId: r.playerId,
      playerName: r.playerName,
      avatarVersion: r.avatarVersion,
      points: r.points,
      matches: r.matches,
      jokerUsed: false,
    })),
    ...jokers
      .filter((j) => !playedIds.has(j.playerId))
      .map((j) => ({
        playerId: j.playerId,
        playerName: j.playerName,
        avatarVersion: j.avatarVersion,
        points: Math.round(j.pointsCredited),
        matches: j.gamesCredited,
        jokerUsed: true,
      })),
  ];
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.matches !== a.matches) return b.matches - a.matches;
    return a.playerName.localeCompare(b.playerName, "de");
  });
  return rows;
}
