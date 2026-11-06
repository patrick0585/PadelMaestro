interface TrendLine {
  playerId: string;
  values: (number | null)[];
  points: (number | null)[];
}

export interface DayGap {
  gap: number; // displayed points behind the top of that day
  first: boolean; // I held place 1 (possibly shared) that day
}

/**
 * Player on place 1 after the last finished day. On a shared top place: more raw
 * points, then player id (byte order) — the same final tiebreak as the table.
 */
export function trendLeaderId(players: TrendLine[]): string | null {
  const key = (p: TrendLine) => ({ rank: p.values.at(-1) ?? Infinity, pts: p.points.at(-1) ?? 0 });
  let best: TrendLine | null = null;
  for (const p of players) {
    if (p.values.at(-1) == null) continue;
    if (!best) {
      best = p;
      continue;
    }
    const a = key(p);
    const b = key(best);
    if (a.rank < b.rank || (a.rank === b.rank && (a.pts > b.pts || (a.pts === b.pts && p.playerId < best.playerId))))
      best = p;
  }
  return best?.playerId ?? null;
}

/** Per finished day: my gap to the top in displayed points; null before my first appearance. */
export function gapToLeaderByDay(players: TrendLine[], meId: string): (DayGap | null)[] {
  const me = players.find((p) => p.playerId === meId);
  if (!me) return [];
  return me.points.map((mine, i) => {
    if (mine == null) return null;
    const top = Math.max(...players.map((p) => Math.round(p.points[i] ?? 0)));
    return { gap: top - Math.round(mine), first: me.values[i] === 1 };
  });
}
