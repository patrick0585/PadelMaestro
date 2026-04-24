import { describe, it, expect } from "vitest";
import { formatScoredBy } from "@/lib/match/scored-by";

describe("formatScoredBy", () => {
  it("returns null when the player name is missing", () => {
    expect(formatScoredBy(null, "2026-04-24T17:42:00.000Z")).toBeNull();
    expect(formatScoredBy(undefined, "2026-04-24T17:42:00.000Z")).toBeNull();
  });

  it("returns null when the timestamp is missing", () => {
    expect(formatScoredBy("Patrick", null)).toBeNull();
    expect(formatScoredBy("Patrick", undefined)).toBeNull();
  });

  it("formats name and time in de-DE locale", () => {
    const result = formatScoredBy("Patrick", "2026-04-24T17:42:00.000Z");
    expect(result).toMatch(/^eingetragen von Patrick · \d{2}:\d{2}$/);
  });

  it("includes the exact player name", () => {
    const result = formatScoredBy("Werner", "2026-04-24T17:42:00.000Z");
    expect(result).toContain("Werner");
  });
});
