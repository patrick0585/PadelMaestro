import { describe, it, expect } from "vitest";
import { _colorForPlayerForTesting as colorForPlayer } from "@/components/season-trend-chart";

describe("colorForPlayer", () => {
  it("returns a valid hex color", () => {
    const c = colorForPlayer("any-id");
    expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("is deterministic — same id returns the same color across calls", () => {
    const id = "player-abc-123";
    expect(colorForPlayer(id)).toBe(colorForPlayer(id));
  });

  it("differs across distinct ids more often than not", () => {
    // Birthday-paradox sanity: 8-color palette + 100 random ids should
    // hit several distinct colors, not collapse to one.
    const ids = Array.from({ length: 100 }, (_, i) => `player-${i}`);
    const distinct = new Set(ids.map(colorForPlayer));
    expect(distinct.size).toBeGreaterThanOrEqual(5);
  });
});
