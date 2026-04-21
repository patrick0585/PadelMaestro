import { describe, it, expect } from "vitest";
import { validateScore } from "@/lib/match/validate";

describe("validateScore", () => {
  describe("sum-to-3 format", () => {
    it.each([
      [3, 0],
      [2, 1],
      [1, 2],
      [0, 3],
    ])("accepts %i:%i", (a, b) => {
      expect(validateScore(a, b, "sum-to-3").ok).toBe(true);
    });

    it.each([
      [3, 3],
      [4, 0],
      [1, 1],
      [3, 1],
      [3, 2],
      [0, 0],
      [-1, 3],
    ])("rejects %i:%i", (a, b) => {
      expect(validateScore(a, b, "sum-to-3").ok).toBe(false);
    });
  });

  describe("tennis-set format", () => {
    it.each([
      [6, 0],
      [6, 1],
      [6, 2],
      [6, 3],
      [6, 4],
      [0, 6],
      [4, 6],
      [7, 5],
      [5, 7],
      [8, 6],
      [6, 8],
      [10, 8],
    ])("accepts %i:%i", (a, b) => {
      expect(validateScore(a, b, "tennis-set").ok).toBe(true);
    });

    it.each([
      [6, 6],
      [5, 5],
      [6, 5],
      [5, 6],
      [7, 6],
      [7, 4],
      [8, 5],
      [10, 5],
      [0, 0],
      [-1, 6],
    ])("rejects %i:%i", (a, b) => {
      expect(validateScore(a, b, "tennis-set").ok).toBe(false);
    });
  });
});
