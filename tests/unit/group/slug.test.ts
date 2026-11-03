import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/group/slug";

describe("slugify", () => {
  it("transliterates umlauts and sharp s", () => {
    expect(slugify("Padel Wien Süd")).toBe("padel-wien-sued");
    expect(slugify("Straße 1")).toBe("strasse-1");
    expect(slugify("ÄÖÜ")).toBe("aeoeue");
  });

  it("falls back to 'gruppe' when nothing is left", () => {
    expect(slugify("🎾🎾")).toBe("gruppe");
    expect(slugify("")).toBe("gruppe");
  });

  it("trims to 40 chars without trailing dash", () => {
    const s = slugify("a".repeat(39) + " " + "b".repeat(10));
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith("-")).toBe(false);
    expect(slugify("x".repeat(60))).toBe("x".repeat(40));
  });
});
