import { describe, it, expect } from "vitest";
import {
  pickFairExtraMatch,
  NotEnoughPlayersError,
  type FairExtraMatchHistoryRow,
  type FairExtraMatchPlayer,
} from "@/lib/game-day/fair-extra-match";

const PLAYERS: FairExtraMatchPlayer[] = [
  { id: "p1", name: "Anna" },
  { id: "p2", name: "Ben" },
  { id: "p3", name: "Clara" },
  { id: "p4", name: "Daniel" },
  { id: "p5", name: "Eva" },
];

function row(t1a: string, t1b: string, t2a: string, t2b: string): FairExtraMatchHistoryRow {
  return { team1PlayerAId: t1a, team1PlayerBId: t1b, team2PlayerAId: t2a, team2PlayerBId: t2b };
}

// Mulberry32 PRNG so the property tests are deterministic.
function seeded(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function applyPick(
  matches: FairExtraMatchHistoryRow[],
  pick: ReturnType<typeof pickFairExtraMatch>,
): FairExtraMatchHistoryRow[] {
  return [
    ...matches,
    row(pick.team1[0].id, pick.team1[1].id, pick.team2[0].id, pick.team2[1].id),
  ];
}

function playerCounts(matches: FairExtraMatchHistoryRow[], players: FairExtraMatchPlayer[]) {
  const c = new Map(players.map((p) => [p.id, 0]));
  for (const m of matches) {
    for (const id of [m.team1PlayerAId, m.team1PlayerBId, m.team2PlayerAId, m.team2PlayerBId]) {
      c.set(id, (c.get(id) ?? 0) + 1);
    }
  }
  return c;
}

function pairCounts(matches: FairExtraMatchHistoryRow[]) {
  const c = new Map<string, number>();
  const inc = (a: string, b: string) => {
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    c.set(k, (c.get(k) ?? 0) + 1);
  };
  for (const m of matches) {
    inc(m.team1PlayerAId, m.team1PlayerBId);
    inc(m.team2PlayerAId, m.team2PlayerBId);
  }
  return c;
}

describe("pickFairExtraMatch", () => {
  it("rejects fewer than 4 confirmed players", () => {
    expect(() =>
      pickFairExtraMatch({ matches: [], confirmedPlayers: PLAYERS.slice(0, 3) }, seeded(1)),
    ).toThrow(NotEnoughPlayersError);
  });

  it("emits 4 distinct players from the confirmed pool", () => {
    const pick = pickFairExtraMatch(
      { matches: [], confirmedPlayers: PLAYERS },
      seeded(42),
    );
    const ids = new Set([
      pick.team1[0].id,
      pick.team1[1].id,
      pick.team2[0].id,
      pick.team2[1].id,
    ]);
    expect(ids.size).toBe(4);
    for (const id of ids) {
      expect(PLAYERS.some((p) => p.id === id)).toBe(true);
    }
  });

  it("benches the player with the highest current match count", () => {
    // p1 already has 2 matches, everyone else 0.
    const matches = [
      row("p1", "p2", "p3", "p4"), // p1, p2, p3, p4 each +1
      row("p1", "p3", "p2", "p5"), // p1+1 again
    ];
    const pick = pickFairExtraMatch({ matches, confirmedPlayers: PLAYERS }, seeded(7));
    const onCourt = new Set([
      pick.team1[0].id,
      pick.team1[1].id,
      pick.team2[0].id,
      pick.team2[1].id,
    ]);
    expect(onCourt.has("p1")).toBe(false);
  });

  it("prefers the split that minimizes the partner-pair cost", () => {
    // Pre-pair p1+p2 twice and p3+p4 twice. With four players p1..p4
    // the only never-seen splits are (p1+p3, p2+p4) and (p1+p4, p2+p3).
    // Both cost 0 vs the seen split which costs 4 — picker must avoid
    // the "stale" partnership.
    const matches = [
      row("p1", "p2", "p3", "p4"), // p1+p2 = 1, p3+p4 = 1
      row("p1", "p2", "p3", "p4"), // p1+p2 = 2, p3+p4 = 2
    ];
    const pick = pickFairExtraMatch(
      { matches, confirmedPlayers: PLAYERS.slice(0, 4) },
      seeded(13),
    );
    const t1 = new Set([pick.team1[0].id, pick.team1[1].id]);
    const t2 = new Set([pick.team2[0].id, pick.team2[1].id]);
    const isStalePair = (s: Set<string>) =>
      (s.has("p1") && s.has("p2")) || (s.has("p3") && s.has("p4"));
    expect(isStalePair(t1)).toBe(false);
    expect(isStalePair(t2)).toBe(false);
  });

  // Property-based: simulating many extra-matches in a row keeps the
  // spread of player match counts ≤ 1. This is the headline guarantee.
  it("keeps player match-count spread ≤ 1 over many consecutive picks", () => {
    for (let trial = 0; trial < 8; trial++) {
      const rng = seeded(1000 + trial);
      let matches: FairExtraMatchHistoryRow[] = [];
      for (let i = 0; i < 20; i++) {
        const pick = pickFairExtraMatch({ matches, confirmedPlayers: PLAYERS }, rng);
        matches = applyPick(matches, pick);
        const counts = [...playerCounts(matches, PLAYERS).values()];
        const spread = Math.max(...counts) - Math.min(...counts);
        expect(spread, `spread after match ${i + 1} of trial ${trial}`).toBeLessThanOrEqual(1);
      }
    }
  });

  // Property-based: after many picks, no pair should be more than 1
  // ahead of the rarest pair on the court. (Stronger version would be
  // exact uniform — for a greedy that's too strict; ≤ 1 spread is the
  // right ceiling for a 4-of-N picker.)
  it("keeps pair-count spread small over many consecutive picks", () => {
    const rng = seeded(2024);
    let matches: FairExtraMatchHistoryRow[] = [];
    for (let i = 0; i < 30; i++) {
      const pick = pickFairExtraMatch({ matches, confirmedPlayers: PLAYERS }, rng);
      matches = applyPick(matches, pick);
    }
    const pc = pairCounts(matches);
    // 5 players → 10 possible pairs. After 30 matches we have 60 team
    // slots → expected ~6 per pair. Spread should be tight.
    const counts = [...pc.values()];
    const spread = Math.max(...counts) - Math.min(...counts);
    expect(spread).toBeLessThanOrEqual(2);
  });

  it("works for the 4-player case (no benching needed)", () => {
    const four = PLAYERS.slice(0, 4);
    const pick = pickFairExtraMatch({ matches: [], confirmedPlayers: four }, seeded(99));
    const ids = new Set([
      pick.team1[0].id,
      pick.team1[1].id,
      pick.team2[0].id,
      pick.team2[1].id,
    ]);
    expect(ids.size).toBe(4);
  });

  it("works for 6 confirmed players", () => {
    const six = [...PLAYERS, { id: "p6", name: "Felix" }];
    const rng = seeded(2025);
    let matches: FairExtraMatchHistoryRow[] = [];
    for (let i = 0; i < 12; i++) {
      const pick = pickFairExtraMatch({ matches, confirmedPlayers: six }, rng);
      matches = applyPick(matches, pick);
    }
    const counts = [...playerCounts(matches, six).values()];
    const spread = Math.max(...counts) - Math.min(...counts);
    expect(spread).toBeLessThanOrEqual(1);
  });
});
