import { describe, it, expect } from "vitest";
import { USERNAME_REGEX, isValidUsername, normaliseUsername } from "@/lib/auth/username";

describe("isValidUsername", () => {
  it("accepts lowercase alnum + underscore of length 3-32", () => {
    expect(isValidUsername("abc")).toBe(true);
    expect(isValidUsername("a_b")).toBe(true);
    expect(isValidUsername("user_123")).toBe(true);
    expect(isValidUsername("a".repeat(32))).toBe(true);
  });

  it("rejects too short, too long, or forbidden characters", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("a".repeat(33))).toBe(false);
    expect(isValidUsername("Has-Dash")).toBe(false);
    expect(isValidUsername("has space")).toBe(false);
    expect(isValidUsername("UPPER")).toBe(false);
    expect(isValidUsername("emoji🙂")).toBe(false);
    expect(isValidUsername("")).toBe(false);
  });

  it("exports the regex as USERNAME_REGEX", () => {
    expect(USERNAME_REGEX.test("ok_1")).toBe(true);
    expect(USERNAME_REGEX.test("NOPE")).toBe(false);
  });
});

describe("normaliseUsername", () => {
  it("lowercases and trims the input", () => {
    expect(normaliseUsername("  User_One  ")).toBe("user_one");
    expect(normaliseUsername("ABC")).toBe("abc");
  });
});
