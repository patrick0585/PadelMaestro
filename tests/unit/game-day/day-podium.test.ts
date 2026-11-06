import { describe, it, expect } from "vitest";
import { pairingFairness, splitPodium } from "@/lib/game-day/day-podium";

const r = (playerId: string, rank: number) => ({ playerId, rank });

describe("splitPodium", () => {
  it("eine Stufe pro Platz 1–3, geteilte Plätze zusammen, Rest ab Platz 4", () => {
    const { steps, rest } = splitPodium([r("p", 1), r("d", 2), r("a", 3), r("e", 3), r("b", 4), r("c", 4)]);
    expect(steps.map((s) => [s.rank, s.players.map((p) => p.playerId)])).toEqual([
      [1, ["p"]],
      [2, ["d"]],
      [3, ["a", "e"]],
    ]);
    expect(rest.map((x) => x.playerId)).toEqual(["b", "c"]);
  });

  it("alte Wertung 1, 1, 3: Platz 2 fehlt", () => {
    const { steps } = splitPodium([r("a", 1), r("b", 1), r("c", 3), r("d", 4)]);
    expect(steps.map((s) => s.rank)).toEqual([1, 3]);
  });

  it("leer", () => {
    expect(splitPodium([])).toEqual({ steps: [], rest: [] });
  });
});

describe("pairingFairness", () => {
  it("alle gleich oft: fair", () => {
    expect(pairingFairness([2, 2, 2])).toEqual({ fair: true, text: "jede Paarung 2 Mal" });
  });
  it("Unterschiede: Spanne", () => {
    expect(pairingFairness([1, 3, 2])).toEqual({ fair: false, text: "1 bis 3 Mal je Paarung" });
  });
  it("nicht gespielte Paarungen zählen mit", () => {
    expect(pairingFairness([0, 1, 1])).toEqual({ fair: false, text: "0 bis 1 Mal je Paarung" });
  });
});
