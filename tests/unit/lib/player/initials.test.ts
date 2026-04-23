import { describe, it, expect } from "vitest";
import { initials } from "@/lib/player/initials";

describe("initials", () => {
  it("returns the first two letters for a two-part name", () => {
    expect(initials("Patrick Berger")).toBe("PB");
  });

  it("returns the first and last letter for a three-part name", () => {
    expect(initials("Anna Maria Schmidt")).toBe("AS");
  });

  it("returns a single uppercase letter for a one-word name", () => {
    expect(initials("Patrick")).toBe("P");
  });

  it("returns an empty string for an empty name", () => {
    expect(initials("")).toBe("");
  });

  it("collapses whitespace and handles tabs", () => {
    expect(initials("  Patrick\tBerger  ")).toBe("PB");
  });
});
