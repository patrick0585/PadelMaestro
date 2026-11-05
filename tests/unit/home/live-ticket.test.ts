import { describe, it, expect } from "vitest";
import { deriveLiveTicket, type LiveMatchInput } from "@/lib/home/live-ticket";

const names: Record<string, string> = { a: "Anna", b: "Ben", c: "Clara", d: "Daniel" };
const m = (n: number, s1: number | null, s2: number | null): LiveMatchInput => ({
  matchNumber: n,
  team1: ["a", "b"],
  team2: ["c", "d"],
  team1Score: s1,
  team2Score: s2,
});

describe("deriveLiveTicket", () => {
  it("Segmente, letztes gewertetes und aktuelles Match", () => {
    const t = deriveLiveTicket([m(3, null, null), m(1, 11, 8), m(2, 6, 11), m(4, null, null)], names);
    expect(t.total).toBe(4);
    expect(t.segments).toEqual(["done", "done", "current", "open"]);
    expect(t.currentNumber).toBe(3);
    expect(t.last).toEqual({ matchNumber: 2, team1: ["Anna", "Ben"], team2: ["Clara", "Daniel"], score: [6, 11] });
    expect(t.current).toEqual({ matchNumber: 3, team1: ["Anna", "Ben"], team2: ["Clara", "Daniel"] });
  });

  it("vor dem ersten Ergebnis gibt es kein letztes Match", () => {
    const t = deriveLiveTicket([m(1, null, null), m(2, null, null)], names);
    expect(t.last).toBeNull();
    expect(t.currentNumber).toBe(1);
    expect(t.segments).toEqual(["current", "open"]);
  });

  it("ohne Matches ist alles leer", () => {
    const t = deriveLiveTicket([], names);
    expect(t).toEqual({ total: 0, segments: [], currentNumber: null, last: null, current: null });
  });

  it("0:0 zählt als gewertet, halb eingetragen nicht", () => {
    const t = deriveLiveTicket([m(1, 0, 0), { ...m(2, 3, null) }], names);
    expect(t.segments).toEqual(["done", "current"]);
  });

  it("alles gewertet: kein aktuelles Match", () => {
    const t = deriveLiveTicket([m(1, 11, 3), m(2, 2, 11)], names);
    expect(t.current).toBeNull();
    expect(t.currentNumber).toBeNull();
    expect(t.segments).toEqual(["done", "done"]);
    expect(t.last?.matchNumber).toBe(2);
  });
});
