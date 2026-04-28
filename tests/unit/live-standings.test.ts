import { describe, it, expect } from "vitest";
import {
  deriveLiveStandings,
  type DayLiveStandingsRow,
} from "@/lib/game-day/live-standings";

interface Match {
  id: string;
  scoredAt: Date | null;
  team1PlayerAId: string;
  team1PlayerBId: string;
  team2PlayerAId: string;
  team2PlayerBId: string;
  team1Score: number;
  team2Score: number;
}

const PLAYERS = [
  { id: "a", name: "Anna", avatarVersion: 0 },
  { id: "b", name: "Ben", avatarVersion: 0 },
  { id: "c", name: "Carl", avatarVersion: 0 },
  { id: "d", name: "Dora", avatarVersion: 0 },
];

function match(
  id: string,
  scoredAtSec: number,
  team1: [string, string],
  team2: [string, string],
  scores: [number, number],
): Match {
  return {
    id,
    scoredAt: new Date(2026, 3, 28, 0, 0, scoredAtSec),
    team1PlayerAId: team1[0],
    team1PlayerBId: team1[1],
    team2PlayerAId: team2[0],
    team2PlayerBId: team2[1],
    team1Score: scores[0],
    team2Score: scores[1],
  };
}

function rankOf(rows: DayLiveStandingsRow[], playerId: string): number {
  const r = rows.find((x) => x.playerId === playerId);
  if (!r) throw new Error(`player not in standings: ${playerId}`);
  return r.rank;
}

function rowOf(rows: DayLiveStandingsRow[], playerId: string): DayLiveStandingsRow {
  const r = rows.find((x) => x.playerId === playerId);
  if (!r) throw new Error(`player not in standings: ${playerId}`);
  return r;
}

describe("deriveLiveStandings", () => {
  it("returns hasPreviousState=false when only one match has been scored", () => {
    const matches = [match("m1", 10, ["a", "b"], ["c", "d"], [10, 5])];
    const result = deriveLiveStandings(matches, PLAYERS, 16);
    expect(result.hasPreviousState).toBe(false);
    expect(result.scoredMatchCount).toBe(1);
    expect(result.totalMatchCount).toBe(16);
    for (const row of result.rows) {
      expect(row.previousRank).toBeNull();
    }
  });

  it("includes every player who has played at least one scored match", () => {
    const matches = [match("m1", 10, ["a", "b"], ["c", "d"], [10, 5])];
    const result = deriveLiveStandings(matches, PLAYERS, 16);
    const ids = result.rows.map((r) => r.playerId).sort();
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });

  it("assigns competition ranks (1, 2, 2, 4) for tied points + matches", () => {
    const matches = [
      match("m1", 10, ["a", "b"], ["c", "d"], [10, 0]),
      match("m2", 20, ["a", "c"], ["b", "d"], [10, 0]),
    ];
    const result = deriveLiveStandings(matches, PLAYERS, 16);
    expect(rankOf(result.rows, "a")).toBe(1);
    expect(rankOf(result.rows, "b")).toBe(2);
    expect(rankOf(result.rows, "c")).toBe(2);
    expect(rankOf(result.rows, "d")).toBe(4);
  });

  it("flags upward movement when the latest match lifted a player past another", () => {
    // After match 1: Anna 10, Ben 10 (tied 1st), Carl 0, Dora 0 (tied 3rd)
    // After match 2 (Anna+Carl beat Ben+Dora 12:3): Anna 22, Carl 12, Ben 13, Dora 3
    // current ranks: Anna 1, Ben 2, Carl 3, Dora 4
    // previous ranks (before match 2): Anna 1, Ben 1, Carl 3, Dora 3
    const matches = [
      match("m1", 10, ["a", "b"], ["c", "d"], [10, 0]),
      match("m2", 20, ["a", "c"], ["b", "d"], [12, 3]),
    ];
    const result = deriveLiveStandings(matches, PLAYERS, 16);
    expect(result.hasPreviousState).toBe(true);

    expect(rowOf(result.rows, "a")).toMatchObject({ rank: 1, previousRank: 1 });
    expect(rowOf(result.rows, "b")).toMatchObject({ rank: 2, previousRank: 1 });
    expect(rowOf(result.rows, "c")).toMatchObject({ rank: 3, previousRank: 3 });
    expect(rowOf(result.rows, "d")).toMatchObject({ rank: 4, previousRank: 3 });
  });

  it("marks a player as having no previous rank if they only played the latest match", () => {
    const matches = [
      match("m1", 10, ["a", "b"], ["c", "d"], [10, 0]),
      match("m2", 20, ["a", "c"], ["b", "d"], [3, 12]),
    ];
    const r1 = deriveLiveStandings(matches, PLAYERS, 16);
    expect(r1.rows.every((row) => row.previousRank !== null)).toBe(true);

    const fivePlayers = [...PLAYERS, { id: "e", name: "Eric", avatarVersion: 0 }];
    const newEntrant = [
      match("m1", 10, ["a", "b"], ["c", "d"], [10, 0]),
      match("m2", 20, ["a", "e"], ["b", "c"], [12, 3]),
    ];
    const r2 = deriveLiveStandings(newEntrant, fivePlayers, 16);
    expect(rowOf(r2.rows, "e").previousRank).toBeNull();
    expect(r2.hasPreviousState).toBe(true);
  });

  it("uses scoredAt to identify the latest match (id breaks scoredAt ties)", () => {
    // Two matches with identical scoredAt — id desc wins.
    const a = match("zz", 10, ["a", "b"], ["c", "d"], [10, 0]);
    const b = match("aa", 10, ["a", "c"], ["b", "d"], [12, 3]);
    const result = deriveLiveStandings([a, b], PLAYERS, 16);
    // "zz" is the latest by id tiebreak. Previous = match "aa" only.
    // After "aa": Anna 12, Carl 12, Ben 3, Dora 3 → tied ranks 1,1,3,3
    // After both: Anna 22, Carl 12, Ben 13, Dora 3 → 1, 2, 3, 4
    expect(result.hasPreviousState).toBe(true);
    expect(rowOf(result.rows, "a")).toMatchObject({ rank: 1, previousRank: 1 });
    expect(rowOf(result.rows, "b")).toMatchObject({ rank: 2, previousRank: 3 });
    expect(rowOf(result.rows, "c")).toMatchObject({ rank: 3, previousRank: 1 });
    expect(rowOf(result.rows, "d")).toMatchObject({ rank: 4, previousRank: 3 });
  });

  it("returns empty rows when no match has been scored", () => {
    const result = deriveLiveStandings([], PLAYERS, 16);
    expect(result.rows).toEqual([]);
    expect(result.scoredMatchCount).toBe(0);
    expect(result.hasPreviousState).toBe(false);
  });
});
