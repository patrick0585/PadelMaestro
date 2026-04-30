import { describe, it, expect } from "vitest";
import {
  computePartnershipCounts,
  type PartnershipMatch,
  type PartnershipPlayer,
} from "@/lib/game-day/partnerships";

const PLAYERS: PartnershipPlayer[] = [
  { id: "p1", name: "Anna" },
  { id: "p2", name: "Ben" },
  { id: "p3", name: "Clara" },
  { id: "p4", name: "Daniel" },
  { id: "p5", name: "Eva" },
];

function match(
  t1a: string,
  t1b: string,
  t2a: string,
  t2b: string,
  scored: boolean,
): PartnershipMatch {
  return {
    team1PlayerAId: t1a,
    team1PlayerBId: t1b,
    team2PlayerAId: t2a,
    team2PlayerBId: t2b,
    team1Score: scored ? 3 : null,
    team2Score: scored ? 0 : null,
  };
}

describe("computePartnershipCounts", () => {
  it("returns C(n,2) rows — one per unordered pair", () => {
    const rows = computePartnershipCounts([], PLAYERS);
    // 5 players → 10 pairs
    expect(rows).toHaveLength(10);
  });

  it("emits zero counts for pairs that never partnered", () => {
    const rows = computePartnershipCounts([], PLAYERS);
    expect(rows.every((r) => r.count === 0)).toBe(true);
  });

  it("counts a partnership once per scored match", () => {
    // p1+p2 partnered once against p3+p4
    const rows = computePartnershipCounts(
      [match("p1", "p2", "p3", "p4", true)],
      PLAYERS,
    );
    const annaBen = rows.find(
      (r) =>
        (r.playerAId === "p1" && r.playerBId === "p2") ||
        (r.playerAId === "p2" && r.playerBId === "p1"),
    );
    expect(annaBen?.count).toBe(1);
    // Same match makes p3+p4 a partnership too.
    const claraDan = rows.find(
      (r) =>
        (r.playerAId === "p3" && r.playerBId === "p4") ||
        (r.playerAId === "p4" && r.playerBId === "p3"),
    );
    expect(claraDan?.count).toBe(1);
  });

  it("does NOT count opponents as partners", () => {
    // p1+p2 vs p3+p4 — p1 and p3 are NOT partners.
    const rows = computePartnershipCounts(
      [match("p1", "p2", "p3", "p4", true)],
      PLAYERS,
    );
    const annaClara = rows.find(
      (r) =>
        (r.playerAId === "p1" && r.playerBId === "p3") ||
        (r.playerAId === "p3" && r.playerBId === "p1"),
    );
    expect(annaClara?.count).toBe(0);
  });

  it("ignores unscored matches", () => {
    const rows = computePartnershipCounts(
      [match("p1", "p2", "p3", "p4", false)],
      PLAYERS,
    );
    expect(rows.every((r) => r.count === 0)).toBe(true);
  });

  it("treats team1+team1 vs team2+team2 the same as the swapped order", () => {
    // Pair-key normalization: (p2,p1) must hit the same bucket as (p1,p2).
    const rows = computePartnershipCounts(
      [match("p2", "p1", "p4", "p3", true)],
      PLAYERS,
    );
    const annaBen = rows.find(
      (r) =>
        (r.playerAId === "p1" && r.playerBId === "p2") ||
        (r.playerAId === "p2" && r.playerBId === "p1"),
    );
    expect(annaBen?.count).toBe(1);
  });

  it("sums correctly across multiple matches", () => {
    const rows = computePartnershipCounts(
      [
        match("p1", "p2", "p3", "p4", true), // p1+p2, p3+p4
        match("p1", "p2", "p3", "p5", true), // p1+p2, p3+p5
        match("p1", "p3", "p2", "p4", true), // p1+p3, p2+p4
      ],
      PLAYERS,
    );
    const get = (a: string, b: string) =>
      rows.find(
        (r) =>
          (r.playerAId === a && r.playerBId === b) ||
          (r.playerAId === b && r.playerBId === a),
      )?.count;
    expect(get("p1", "p2")).toBe(2);
    expect(get("p3", "p4")).toBe(1);
    expect(get("p3", "p5")).toBe(1);
    expect(get("p1", "p3")).toBe(1);
    expect(get("p2", "p4")).toBe(1);
    expect(get("p1", "p4")).toBe(0);
    expect(get("p4", "p5")).toBe(0);
  });

  it("sorts by count desc, then alphabetically", () => {
    const rows = computePartnershipCounts(
      [
        match("p1", "p2", "p3", "p4", true),
        match("p1", "p2", "p3", "p4", true), // p1+p2 = 2, p3+p4 = 2
        match("p1", "p3", "p2", "p4", true), // p1+p3 = 1, p2+p4 = 1
      ],
      PLAYERS,
    );
    expect(rows[0].count).toBeGreaterThanOrEqual(rows[rows.length - 1].count);
    // Within count=2: Anna/Ben before Clara/Daniel (alphabetical).
    const top = rows.filter((r) => r.count === 2);
    expect(top[0].playerAName).toBe("Anna");
    expect(top[1].playerAName).toBe("Clara");
  });

  it("renders names with German collation (ä, ö, ü)", () => {
    const players: PartnershipPlayer[] = [
      { id: "z", name: "Zora" },
      { id: "ae", name: "Ärnst" },
      { id: "b", name: "Bertha" },
    ];
    const rows = computePartnershipCounts([], players);
    expect(rows[0].playerAName).toBe("Ärnst");
  });

  // Document-the-contract test: rows are the cross-product of the
  // roster the caller passes in. If a player appears in a match but
  // is missing from `players`, their partnerships do not show up.
  // The component layer must therefore source the roster from the
  // matches themselves, not from declared attendance, so that an
  // "extra match" participant with declined attendance is still
  // visible here.
  it("does not invent rows for players present in matches but absent from the roster", () => {
    // p6 is in a match but not in the roster — should be invisible.
    const matches = [match("p1", "p6", "p2", "p3", true)];
    const rows = computePartnershipCounts(matches, PLAYERS);
    expect(rows.some((r) => r.playerAId === "p6" || r.playerBId === "p6")).toBe(false);
    // p2/p3 still surfaces because both are in the roster.
    const benClara = rows.find(
      (r) =>
        (r.playerAId === "p2" && r.playerBId === "p3") ||
        (r.playerAId === "p3" && r.playerBId === "p2"),
    );
    expect(benClara?.count).toBe(1);
  });
});
