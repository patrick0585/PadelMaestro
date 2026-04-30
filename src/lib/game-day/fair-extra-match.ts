// Pick a fair extra match for an in-progress / roster-locked game day.
//
// Two-step greedy:
//   1. Pick four players with the lowest current match count
//      (random tie-break among players sharing the same count).
//   2. Split those four into two teams along whichever 2v2 split has
//      the lowest combined partner count (random tie-break again).
//
// The result is deterministic given a seeded RNG, which lets us write
// property-based tests over many random orderings.

export interface FairExtraMatchPlayer {
  readonly id: string;
  readonly name: string;
}

export interface FairExtraMatchHistoryRow {
  readonly team1PlayerAId: string;
  readonly team1PlayerBId: string;
  readonly team2PlayerAId: string;
  readonly team2PlayerBId: string;
}

export interface FairExtraMatchInputs {
  // All matches already created on this game day, regardless of score
  // status. We count them so a freshly-created (unscored) match still
  // contributes to player + pair counts when picking the next one.
  readonly matches: ReadonlyArray<FairExtraMatchHistoryRow>;
  readonly confirmedPlayers: ReadonlyArray<FairExtraMatchPlayer>;
}

export interface FairExtraMatchPick {
  readonly team1: readonly [FairExtraMatchPlayer, FairExtraMatchPlayer];
  readonly team2: readonly [FairExtraMatchPlayer, FairExtraMatchPlayer];
}

export class NotEnoughPlayersError extends Error {
  constructor(count: number) {
    super(`need at least 4 confirmed players, got ${count}`);
    this.name = "NotEnoughPlayersError";
  }
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function buildCounts(rows: ReadonlyArray<FairExtraMatchHistoryRow>) {
  const playerCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  const inc = <K>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const r of rows) {
    inc(playerCounts, r.team1PlayerAId);
    inc(playerCounts, r.team1PlayerBId);
    inc(playerCounts, r.team2PlayerAId);
    inc(playerCounts, r.team2PlayerBId);
    inc(pairCounts, pairKey(r.team1PlayerAId, r.team1PlayerBId));
    inc(pairCounts, pairKey(r.team2PlayerAId, r.team2PlayerBId));
  }
  return { playerCounts, pairCounts };
}

// Stable shuffle of an array with a seeded RNG. Used to pick uniformly
// among ties without leaking input order into the result.
function shuffle<T>(arr: ReadonlyArray<T>, rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickFairExtraMatch(
  inputs: FairExtraMatchInputs,
  rng: () => number = Math.random,
): FairExtraMatchPick {
  if (inputs.confirmedPlayers.length < 4) {
    throw new NotEnoughPlayersError(inputs.confirmedPlayers.length);
  }

  const { playerCounts, pairCounts } = buildCounts(inputs.matches);

  // Step 1 — pick four players with the lowest match count.
  // Shuffle first so equal-count ties are broken uniformly.
  const shuffledPlayers = shuffle(inputs.confirmedPlayers, rng);
  const sortedPlayers = shuffledPlayers
    .slice()
    .sort((a, b) => (playerCounts.get(a.id) ?? 0) - (playerCounts.get(b.id) ?? 0));
  const four = sortedPlayers.slice(0, 4);

  // Step 2 — among the three possible 2v2 splits, pick the one with
  // the lowest sum of partner-pair counts.
  const [a, b, c, d] = four;
  const splits: Array<{
    team1: readonly [FairExtraMatchPlayer, FairExtraMatchPlayer];
    team2: readonly [FairExtraMatchPlayer, FairExtraMatchPlayer];
    cost: number;
  }> = [
    { team1: [a, b], team2: [c, d], cost: (pairCounts.get(pairKey(a.id, b.id)) ?? 0) + (pairCounts.get(pairKey(c.id, d.id)) ?? 0) },
    { team1: [a, c], team2: [b, d], cost: (pairCounts.get(pairKey(a.id, c.id)) ?? 0) + (pairCounts.get(pairKey(b.id, d.id)) ?? 0) },
    { team1: [a, d], team2: [b, c], cost: (pairCounts.get(pairKey(a.id, d.id)) ?? 0) + (pairCounts.get(pairKey(b.id, c.id)) ?? 0) },
  ];
  const minCost = Math.min(...splits.map((s) => s.cost));
  const candidates = splits.filter((s) => s.cost === minCost);
  const pick = candidates[Math.floor(rng() * candidates.length)];
  return { team1: pick.team1, team2: pick.team2 };
}
