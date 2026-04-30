import { describe, it, expect } from "vitest";
import { assignPlayersToTemplate } from "@/lib/pairings/assign";
import type { PlayerRef } from "@/lib/pairings/assign";

// Property tests: a shuffled player→slot mapping cannot break fairness,
// because the underlying template is slot-fair. These tests run the
// assignment under many seeds and assert that:
//   1. every player ends up in the same number of matches
//   2. every unordered player pair has the same partner count as the
//      template's underlying slot-pair count
//   3. every player sits out the same number of times

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function statsFor(plans: ReturnType<typeof assignPlayersToTemplate>, players: PlayerRef[]) {
  const matchCount = new Map(players.map((p) => [p.id, 0]));
  const sitCount = new Map(players.map((p) => [p.id, 0]));
  const pairCount = new Map<string, number>();

  for (const m of plans) {
    for (const p of [...m.team1, ...m.team2]) {
      matchCount.set(p.id, (matchCount.get(p.id) ?? 0) + 1);
    }
    for (const p of m.sitting) {
      sitCount.set(p.id, (sitCount.get(p.id) ?? 0) + 1);
    }
    const k1 = pairKey(m.team1[0].id, m.team1[1].id);
    const k2 = pairKey(m.team2[0].id, m.team2[1].id);
    pairCount.set(k1, (pairCount.get(k1) ?? 0) + 1);
    pairCount.set(k2, (pairCount.get(k2) ?? 0) + 1);
  }
  return { matchCount, sitCount, pairCount };
}

function makePlayers(n: number): PlayerRef[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
}

const SEEDS = [
  "seed-a",
  "seed-b",
  "9b3f2a87c1d4",
  "0000000000",
  "ffffffffff",
  "lorem ipsum",
  "🎲random🎲",
  "another-day",
  "preset-from-preview-shuffle",
  "abcdefghij",
];

describe("assignPlayersToTemplate — fairness invariant under any seed", () => {
  for (const n of [4, 5, 6]) {
    describe(`${n} players`, () => {
      const players = makePlayers(n);

      it("every player gets the same number of matches across all seeds", () => {
        for (const seed of SEEDS) {
          const plans = assignPlayersToTemplate(players, seed);
          const { matchCount } = statsFor(plans, players);
          const counts = [...matchCount.values()];
          const min = Math.min(...counts);
          const max = Math.max(...counts);
          expect(max - min, `seed=${seed}`).toBe(0);
        }
      });

      it("every player sits out the same number of times across all seeds", () => {
        for (const seed of SEEDS) {
          const plans = assignPlayersToTemplate(players, seed);
          const { sitCount } = statsFor(plans, players);
          const counts = [...sitCount.values()];
          const min = Math.min(...counts);
          const max = Math.max(...counts);
          expect(max - min, `seed=${seed}`).toBe(0);
        }
      });

      it("every player pair partners the same number of times across all seeds", () => {
        // 4-player template has only 1 match → only 2 of 6 pairs ever
        // partner; the "every pair" guarantee only kicks in for 5/6.
        if (n === 4) return;
        for (const seed of SEEDS) {
          const plans = assignPlayersToTemplate(players, seed);
          const { pairCount } = statsFor(plans, players);
          // Pre-fill all C(n,2) pairs with 0 so a pair that the template
          // never picks shows up in the spread.
          const allPairs = new Map<string, number>();
          for (let i = 0; i < players.length; i++) {
            for (let j = i + 1; j < players.length; j++) {
              allPairs.set(pairKey(players[i].id, players[j].id), 0);
            }
          }
          for (const [k, v] of pairCount) allPairs.set(k, v);

          const counts = [...allPairs.values()];
          const min = Math.min(...counts);
          const max = Math.max(...counts);
          expect(max - min, `seed=${seed}`).toBe(0);
        }
      });

      it("two different seeds produce different orderings (otherwise the shuffle is broken)", () => {
        if (n === 4) return; // single-match template — no permutation visible
        const planA = assignPlayersToTemplate(players, SEEDS[0]);
        const planB = assignPlayersToTemplate(players, SEEDS[1]);
        const firstA = planA[0];
        const firstB = planB[0];
        const sameTeam1 =
          firstA.team1[0].id === firstB.team1[0].id &&
          firstA.team1[1].id === firstB.team1[1].id;
        // It's theoretically possible for two seeds to produce the
        // same Match 1 by accident, but with 5/6-player rosters and
        // these specific seed strings they don't.
        expect(sameTeam1).toBe(false);
      });
    });
  }
});
