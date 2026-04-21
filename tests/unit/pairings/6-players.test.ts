import { describe, it, expect } from "vitest";
import template from "@/lib/pairings/templates/6-players.json";
import { TemplateSchema } from "@/lib/pairings/types";

describe("6-player template", () => {
  it("parses against schema", () => {
    expect(TemplateSchema.safeParse(template).success).toBe(true);
  });

  it("has 15 matches", () => {
    expect(template.matches).toHaveLength(15);
  });

  it("each player sits exactly 5 times", () => {
    const sits = new Map<number, number>();
    for (const m of template.matches) {
      for (const p of m.sitting) sits.set(p, (sits.get(p) ?? 0) + 1);
    }
    for (let p = 1; p <= 6; p++) expect(sits.get(p)).toBe(5);
  });

  it("each player plays exactly 10 matches", () => {
    const plays = new Map<number, number>();
    for (const m of template.matches) {
      for (const p of [...m.team1, ...m.team2]) plays.set(p, (plays.get(p) ?? 0) + 1);
    }
    for (let p = 1; p <= 6; p++) expect(plays.get(p)).toBe(10);
  });

  it("each pair partners exactly 2 times", () => {
    const counts = new Map<string, number>();
    for (const m of template.matches) {
      for (const team of [m.team1, m.team2] as const) {
        const key = team.slice().sort().join("-");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(15);
    for (const [, c] of counts) expect(c).toBe(2);
  });

  it("each pair opposes exactly 4 times", () => {
    const counts = new Map<string, number>();
    for (const m of template.matches) {
      for (const a of m.team1) for (const b of m.team2) {
        const key = [a, b].sort().join("-");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    for (const [, c] of counts) expect(c).toBe(4);
  });
});
