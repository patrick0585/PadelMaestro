import { describe, it, expect } from "vitest";
import { gapText, gapToAbove, movementByPlayer, sharedRanks } from "@/lib/ranking/standing";

describe("movementByPlayer", () => {
  it("Plätze seit dem vorletzten Spieltag (positiv = hoch)", () => {
    const m = movementByPlayer([
      { playerId: "a", values: [3, 2, 1] },
      { playerId: "b", values: [1, 1, 3] },
      { playerId: "c", values: [2, 3, 3] },
    ]);
    expect(m.get("a")).toBe(1);
    expect(m.get("b")).toBe(-2);
    expect(m.get("c")).toBe(0);
  });

  it("null bei nur einem Spieltag oder neu eingestiegen", () => {
    expect(movementByPlayer([{ playerId: "a", values: [1] }]).get("a")).toBeNull();
    expect(movementByPlayer([{ playerId: "a", values: [null, 4] }]).get("a")).toBeNull();
  });
});

describe("gapToAbove", () => {
  const rows = [
    { playerId: "a", rank: 1, points: 239.4 },
    { playerId: "b", rank: 2, points: 231 },
    { playerId: "me", rank: 3, points: 224.2 },
    { playerId: "d", rank: 4, points: 224 },
  ];

  it("Abstand auf den Platz davor, gerundet wie angezeigt", () => {
    expect(gapToAbove(rows, "me")).toEqual({ kind: "behind", gap: 7, toRank: 2 });
  });

  it("Spitzenreiter: Vorsprung", () => {
    expect(gapToAbove(rows, "a")).toEqual({ kind: "lead", over: 8 });
  });

  it("geteilter Platz statt Abstand", () => {
    const tied = [
      { playerId: "a", rank: 1, points: 50 },
      { playerId: "b", rank: 1, points: 50 },
      { playerId: "c", rank: 2, points: 40 },
    ];
    expect(gapToAbove(tied, "a")).toEqual({ kind: "tied", rank: 1 });
    expect(gapToAbove(tied, "b")).toEqual({ kind: "tied", rank: 1 });
    expect(gapToAbove(tied, "c")).toEqual({ kind: "behind", gap: 10, toRank: 1 });
  });

  it("allein oder nicht in der Rangliste", () => {
    expect(gapToAbove([{ playerId: "a", rank: 1, points: 10 }], "a")).toBeNull();
    expect(gapToAbove(rows, "x")).toBeNull();
  });
});

describe("sharedRanks", () => {
  const row = (points: number, games: number) => ({ points, games });

  it("gleiche angezeigte Punkte und gleicher Schnitt teilen sich den Platz, danach ohne Lücke weiter", () => {
    expect(sharedRanks([row(240, 128), row(239.4, 128), row(239.2, 128), row(230, 128), row(230, 128), row(200, 128)])).toEqual([
      1, 2, 2, 3, 3, 4,
    ]);
  });

  it("gleiche Punkte, anderer Schnitt: kein Gleichstand", () => {
    expect(sharedRanks([row(60, 30), row(60, 40)])).toEqual([1, 2]);
  });

  it("Schnitt wird auf 2 Nachkommastellen verglichen", () => {
    expect(sharedRanks([row(100, 61), row(100, 61.001)])).toEqual([1, 1]);
  });

  it("ohne Spiele", () => {
    expect(sharedRanks([row(0, 0), row(0, 0)])).toEqual([1, 1]);
    expect(sharedRanks([])).toEqual([]);
  });
});

describe("gapText", () => {
  it("Singular und Plural", () => {
    expect(gapText({ kind: "lead", over: 1 })).toBe("1 Punkt Vorsprung");
    expect(gapText({ kind: "behind", gap: 1, toRank: 2 })).toBe("1 Punkt hinter Platz 2");
    expect(gapText({ kind: "behind", gap: 3, toRank: 2 })).toBe("3 Punkte hinter Platz 2");
  });

  it("punktgleich und geteilter Platz", () => {
    expect(gapText({ kind: "behind", gap: 0, toRank: 2 })).toBe("punktgleich mit Platz 2");
    expect(gapText({ kind: "tied", rank: 1 })).toBe("geteilter Platz 1");
  });
});
