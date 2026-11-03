import { describe, it, expect } from "vitest";
import { generateToken, hashToken, tokenExpiry } from "@/lib/auth/token";

describe("token", () => {
  it("generates a 43-char base64url token whose hash matches hashToken", () => {
    const { token, hash } = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(hashToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("two tokens differ", () => {
    expect(generateToken().token).not.toBe(generateToken().token);
  });

  it("tokenExpiry adds ms to now", () => {
    expect(
      tokenExpiry(3600_000, new Date("2026-11-03T10:00:00Z")).toISOString(),
    ).toBe("2026-11-03T11:00:00.000Z");
  });
});
