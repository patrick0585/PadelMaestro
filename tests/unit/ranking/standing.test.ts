import { describe, it, expect } from "vitest";
import { gapToAbove, movementByPlayer } from "@/lib/ranking/standing";

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

  it("punktgleich nach Rundung", () => {
    expect(gapToAbove(rows, "d")).toEqual({ kind: "behind", gap: 0, toRank: 3 });
  });

  it("allein oder nicht in der Rangliste", () => {
    expect(gapToAbove([{ playerId: "a", rank: 1, points: 10 }], "a")).toBeNull();
    expect(gapToAbove(rows, "x")).toBeNull();
  });
});
