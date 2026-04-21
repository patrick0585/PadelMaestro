import { describe, it, expect } from "vitest";
import { validateScore } from "@/lib/match/validate";

describe("validateScore", () => {
  describe("first-to-3 format", () => {
    it.each([
      [3, 0],
      [3, 1],
      [3, 2],
      [0, 3],
      [1, 3],
      [2, 3],
    ])("accepts %i:%i", (a, b) => {
      expect(validateScore(a, b, "first-to-3").ok).toBe(true);
    });

    it.each([
      [3, 3],
      [4, 0],
      [2, 2],
      [-1, 3],
      [3, 4],
    ])("rejects %i:%i", (a, b) => {
      expect(validateScore(a, b, "first-to-3").ok).toBe(false);
    });
  });

  describe("first-to-6 format", () => {
    it.each([
      [6, 0],
      [6, 4],
      [6, 5],
      [0, 6],
      [4, 6],
    ])("accepts %i:%i", (a, b) => {
      expect(validateScore(a, b, "first-to-6").ok).toBe(true);
    });

    it.each([
      [6, 6],
      [5, 5],
      [7, 4],
      [-1, 6],
    ])("rejects %i:%i", (a, b) => {
      expect(validateScore(a, b, "first-to-6").ok).toBe(false);
    });
  });
});
