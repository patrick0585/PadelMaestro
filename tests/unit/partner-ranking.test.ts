import { describe, it, expect } from "vitest";
import { MIN_DUO_MATCHES, rankPartners } from "@/lib/player/partner-ranking";

const p = (name: string, pointsTogether: number, matches: number) => ({
  id: name,
  playerId: name,
  name,
  avatarVersion: 0,
  pointsTogether,
  matches,
});

describe("rankPartners", () => {
  it("nutzt den Schnitt pro Match, nicht die Summe", () => {
    const r = rankPartners([p("Michi", 7, 5), p("Paul", 6, 3), p("Lena", 3, 3)]);
    expect(r.best?.name).toBe("Paul");
    expect(r.worst?.name).toBe("Lena");
    expect(r.sorted.map((x) => x.name)).toEqual(["Paul", "Michi", "Lena"]);
  });

  it(`Partner unter ${MIN_DUO_MATCHES} Matches zählen nicht für Bestes/Schlechtestes Duo`, () => {
    const r = rankPartners([p("Zoe", 3, 1), p("Paul", 6, 3), p("Lena", 3, 3), p("Max", 0, 1)]);
    expect(r.best?.name).toBe("Paul");
    expect(r.worst?.name).toBe("Lena");
    expect(r.sorted.map((x) => x.name)).toEqual(["Paul", "Lena", "Zoe", "Max"]);
  });

  it("kein Partner mit genug Matches: alle zählen", () => {
    const r = rankPartners([p("Zoe", 3, 1), p("Paul", 5, 2), p("Lena", 2, 2)]);
    expect(r.best?.name).toBe("Zoe");
    expect(r.worst?.name).toBe("Lena");
  });

  it("genau ein Partner mit genug Matches: er ist Bestes Duo, kein Schlechtestes", () => {
    const r = rankPartners([p("Zoe", 6, 1), p("Paul", 31, 12), p("Lena", 1, 2)]);
    expect(r.best?.name).toBe("Paul");
    expect(r.worst).toBeNull();
    expect(r.sorted[0].name).toBe("Paul");
  });

  it("Gleichstand im Schnitt: mehr Matches zuerst, dann Name", () => {
    const r = rankPartners([p("Bob", 4, 2), p("Alex", 6, 3), p("Anna", 6, 3)]);
    expect(r.sorted.map((x) => x.name)).toEqual(["Alex", "Anna", "Bob"]);
  });

  it("ein Partner: kein Schlechtestes Duo; keiner: nichts", () => {
    expect(rankPartners([p("Paul", 3, 1)])).toMatchObject({ best: { name: "Paul" }, worst: null });
    expect(rankPartners([])).toEqual({ best: null, worst: null, sorted: [] });
  });

  it("alle gleich: Bestes und Schlechtestes sind verschiedene Personen", () => {
    const r = rankPartners([p("A", 6, 3), p("B", 6, 3)]);
    expect(r.best?.name).toBe("A");
    expect(r.worst?.name).toBe("B");
  });
});
