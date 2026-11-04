export type MedalKind = "gold" | "silver" | "bronze";

export const MEDAL_BY_RANK: Record<number, MedalKind> = { 1: "gold", 2: "silver", 3: "bronze" };

// Competition ranking ("1224"): rows tied on points + matches share a rank,
// the next distinct row jumps by the size of the cluster. Input must already
// be sorted by points DESC, matches DESC.
export function assignCompetitionRanks(
  sorted: ReadonlyArray<{ points: number; matches: number }>,
): number[] {
  const ranks: number[] = [];
  let lastRank = 0;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;
    if (!prev || r.points !== prev.points || r.matches !== prev.matches) {
      lastRank = i + 1;
    }
    ranks.push(lastRank);
  }
  return ranks;
}
