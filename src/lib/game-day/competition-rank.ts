export type MedalKind = "gold" | "silver" | "bronze";

export const MEDAL_BY_RANK: Record<number, MedalKind> = { 1: "gold", 2: "silver", 3: "bronze" };

export type RankingMode = "competition" | "dense";

// Seit dem Spieltag vom 03.11.2026 zählen geteilte Plätze dicht (1, 1, 2):
// der Nächstbeste nach zwei Ersten ist Zweiter. Ältere Spieltage behalten
// die Sport-Konvention (1, 1, 3).
export const DENSE_RANKING_FROM = new Date(Date.UTC(2026, 10, 3));

export function rankingModeFor(gameDayDate: Date): RankingMode {
  return gameDayDate.getTime() >= DENSE_RANKING_FROM.getTime() ? "dense" : "competition";
}

// Rows tied on points + matches share a rank. Input must already be sorted by
// points DESC, matches DESC.
export function assignRanks(
  sorted: ReadonlyArray<{ points: number; matches: number }>,
  mode: RankingMode,
): number[] {
  const ranks: number[] = [];
  let rank = 0;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;
    if (!prev || r.points !== prev.points || r.matches !== prev.matches) {
      rank = mode === "dense" ? rank + 1 : i + 1;
    }
    ranks.push(rank);
  }
  return ranks;
}
