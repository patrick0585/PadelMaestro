import { describe, it, expect } from "vitest";
import { isPlaceholderEmail, normaliseEmail } from "@/lib/auth/email";

describe("normaliseEmail", () => {
  it("trims and lowercases", () => {
    expect(normaliseEmail("  Max.Muster@Example.COM \n")).toBe("max.muster@example.com");
  });

  it("leaves an already normalised address unchanged", () => {
    expect(normaliseEmail("a@b.de")).toBe("a@b.de");
  });
});

describe("isPlaceholderEmail", () => {
  it("matches @padel.local regardless of case", () => {
    expect(isPlaceholderEmail("werner@padel.local")).toBe(true);
    expect(isPlaceholderEmail("Werner@Padel.Local")).toBe(true);
  });

  it("does not match real or look-alike domains", () => {
    expect(isPlaceholderEmail("werner@example.com")).toBe(false);
    expect(isPlaceholderEmail("werner@padel.local.de")).toBe(false);
    expect(isPlaceholderEmail("werner@mypadel.localhost")).toBe(false);
  });
});
