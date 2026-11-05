const TOP = 3;

/** Top 3 of the season ranking plus the viewer's own row if it is not among them. */
export function pickTableRows<T extends { playerId: string }>(ranking: T[], meId: string): T[] {
  const rows = ranking.slice(0, TOP);
  const mine = ranking.find((r) => r.playerId === meId);
  return mine && !rows.includes(mine) ? [...rows, mine] : rows;
}
