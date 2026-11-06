import { afterEach, describe, it, expect, vi } from "vitest";
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

  describe("unabhängig von der Zeitzone des Servers", () => {
    afterEach(() => vi.unstubAllEnvs());

    it.each(["UTC", "America/New_York", "Asia/Tokyo"])("zeigt deutsche Uhrzeit, auch wenn TZ=%s", (tz) => {
      vi.stubEnv("TZ", tz);
      expect(formatScoredBy("Patrick", "2026-04-24T17:42:00.000Z")).toBe("eingetragen von Patrick · 19:42");
      expect(formatScoredBy("Patrick", "2026-11-24T17:42:00.000Z")).toBe("eingetragen von Patrick · 18:42");
    });
  });
});
