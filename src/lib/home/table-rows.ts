/**
 * Home table: place 1 plus the viewer with one neighbour above and below
 * (at least three rows). Without an own row: the top 3.
 */
export function pickTableRows<T extends { playerId: string }>(ranking: T[], meId: string): T[] {
  const me = ranking.findIndex((r) => r.playerId === meId);
  if (me < 0) return ranking.slice(0, 3);
  const from = Math.max(0, Math.min(me - 1, ranking.length - 3));
  const to = Math.min(ranking.length, Math.max(me + 2, 3));
  const picked = new Set([0]);
  for (let i = from; i < to; i++) picked.add(i);
  return [...picked].sort((a, b) => a - b).map((i) => ranking[i]);
}
