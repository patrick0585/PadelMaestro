const PODIUM_RANKS = [1, 2, 3];

/** Podium steps for ranks 1–3 (tied players share a step) and the remaining rows. */
export function splitPodium<T extends { rank: number }>(rows: T[]): { steps: { rank: number; players: T[] }[]; rest: T[] } {
  const steps = PODIUM_RANKS.map((rank) => ({ rank, players: rows.filter((r) => r.rank === rank) })).filter(
    (s) => s.players.length > 0,
  );
  return { steps, rest: rows.filter((r) => r.rank > PODIUM_RANKS.length) };
}

/** Short verdict for how evenly team pairings were spread over a day. */
export function pairingFairness(counts: number[]): { fair: boolean; text: string } {
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  return min === max ? { fair: true, text: `jede Paarung ${max}×` } : { fair: false, text: `${min}× bis ${max}× je Paarung` };
}
