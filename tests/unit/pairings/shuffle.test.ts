import { describe, it, expect } from "vitest";
import { seededShuffle, generateSeed } from "@/lib/pairings/shuffle";

describe("seededShuffle", () => {
  it("returns a new array with the same elements", () => {
    const input = [1, 2, 3, 4, 5];
    const out = seededShuffle(input, "seed-abc");
    expect(out).toHaveLength(5);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it("is deterministic with the same seed", () => {
    const a = seededShuffle([1, 2, 3, 4, 5], "seed-1");
    const b = seededShuffle([1, 2, 3, 4, 5], "seed-1");
    expect(a).toEqual(b);
  });

  it("produces different orderings for different seeds", () => {
    const a = seededShuffle([1, 2, 3, 4, 5], "seed-1");
    const b = seededShuffle([1, 2, 3, 4, 5], "seed-2");
    expect(a).not.toEqual(b);
  });

  it("generateSeed returns a URL-safe string of reasonable length", () => {
    const s = generateSeed();
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.length).toBeGreaterThanOrEqual(16);
  });
});
