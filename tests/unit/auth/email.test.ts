import { describe, it, expect } from "vitest";
import { normaliseEmail } from "@/lib/auth/email";

describe("normaliseEmail", () => {
  it("trims and lowercases", () => {
    expect(normaliseEmail("  Max.Muster@Example.COM \n")).toBe("max.muster@example.com");
  });

  it("leaves an already normalised address unchanged", () => {
    expect(normaliseEmail("a@b.de")).toBe("a@b.de");
  });
});
