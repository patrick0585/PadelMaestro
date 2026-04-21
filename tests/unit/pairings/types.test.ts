import { describe, it, expect } from "vitest";
import { TemplateSchema } from "@/lib/pairings/types";

describe("pairing template schema", () => {
  it("accepts a valid template", () => {
    const valid = {
      playerCount: 4,
      format: "tennis-set" as const,
      totalMatches: 3,
      matches: [
        { matchNumber: 1, team1: [1, 2], team2: [3, 4], sitting: [] },
        { matchNumber: 2, team1: [1, 3], team2: [2, 4], sitting: [] },
        { matchNumber: 3, team1: [1, 4], team2: [2, 3], sitting: [] },
      ],
    };
    expect(TemplateSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a template where totalMatches differs from matches.length", () => {
    const invalid = {
      playerCount: 4,
      format: "tennis-set" as const,
      totalMatches: 5,
      matches: [{ matchNumber: 1, team1: [1, 2], team2: [3, 4], sitting: [] }],
    };
    expect(TemplateSchema.safeParse(invalid).success).toBe(false);
  });
});
