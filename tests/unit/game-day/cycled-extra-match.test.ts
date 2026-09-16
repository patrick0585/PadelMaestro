import { describe, it, expect } from "vitest";
import { pickCycledExtraMatch, CYCLED_PLAYER_COUNTS } from "@/lib/game-day/cycled-extra-match";
import { loadTemplate } from "@/lib/pairings/load";

function row(n: number, matchNumber = n) {
  return {
    matchNumber,
    team1PlayerAId: `a${n}`,
    team1PlayerBId: `b${n}`,
    team2PlayerAId: `c${n}`,
    team2PlayerBId: `d${n}`,
  };
}

const fifteen = Array.from({ length: 15 }, (_, i) => row(i + 1));

describe("pickCycledExtraMatch", () => {
  it("starts over with match 1 right after the template", () => {
    expect(pickCycledExtraMatch(fifteen, 15)).toBe(fifteen[0]);
  });

  it("continues with the match following the last one on the list", () => {
    const withExtras = [...fifteen, row(1, 16), row(2, 17)];
    expect(pickCycledExtraMatch(withExtras, 15)).toBe(fifteen[2]);
  });

  it("wraps around after the last template match", () => {
    expect(pickCycledExtraMatch([...fifteen, row(15, 16)], 15)).toBe(fifteen[0]);
  });

  it("recognises a copy regardless of team and player order", () => {
    const swapped = {
      matchNumber: 16,
      team1PlayerAId: "d3",
      team1PlayerBId: "c3",
      team2PlayerAId: "b3",
      team2PlayerBId: "a3",
    };
    expect(pickCycledExtraMatch([...fifteen, swapped], 15)).toBe(fifteen[3]);
  });

  it("survives renumbering after a removed extra match", () => {
    // 16 copied match 1 and was removed; the former 17 (copy of match 2)
    // slid down to 16. The next extra must copy match 3, not match 2 again.
    expect(pickCycledExtraMatch([...fifteen, row(2, 16)], 15)).toBe(fifteen[2]);
  });

  it("throws when template matches are missing", () => {
    expect(() => pickCycledExtraMatch(fifteen.slice(1), 15)).toThrow(/expected 15/);
  });

  it("throws when the last match matches no template pairing", () => {
    expect(() => pickCycledExtraMatch([...fifteen, row(99, 16)], 15)).toThrow(/match 16/);
  });

  it("applies to 4 and 5 players only", () => {
    expect([...CYCLED_PLAYER_COUNTS].sort()).toEqual([4, 5]);
  });

  it.each([4, 5])("%i-player template has no repeated pairing (cycle is unambiguous)", (n) => {
    const t = loadTemplate(n);
    const keys = t.matches.map((m) => {
      const pair = (x: number, y: number) => (x < y ? `${x}|${y}` : `${y}|${x}`);
      const a = pair(m.team1[0], m.team1[1]);
      const b = pair(m.team2[0], m.team2[1]);
      return a < b ? `${a}#${b}` : `${b}#${a}`;
    });
    expect(new Set(keys).size).toBe(keys.length);
  });
});
