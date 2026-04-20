import { describe, it, expect } from "vitest";
import template from "@/lib/pairings/templates/4-players.json";
import { TemplateSchema } from "@/lib/pairings/types";

describe("4-player template", () => {
  it("parses against schema", () => {
    expect(TemplateSchema.safeParse(template).success).toBe(true);
  });

  it("has 3 matches", () => {
    expect(template.matches).toHaveLength(3);
  });

  it("every player plays every match (no one sits)", () => {
    for (const m of template.matches) {
      expect(m.sitting).toHaveLength(0);
    }
  });

  it("each pair partners exactly once", () => {
    const counts = new Map<string, number>();
    for (const m of template.matches) {
      for (const team of [m.team1, m.team2] as const) {
        const key = team.slice().sort().join("-");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const expectedPairs = ["1-2", "1-3", "1-4", "2-3", "2-4", "3-4"];
    expect(Array.from(counts.keys()).sort()).toEqual(expectedPairs.sort());
    for (const [, c] of counts) expect(c).toBe(1);
  });
});
