import { describe, it, expect } from "vitest";
import { generateInvitationToken, isTokenExpired } from "@/lib/auth/token";

describe("invitation token", () => {
  it("generates a URL-safe token of at least 32 characters", () => {
    const token = generateInvitationToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates unique tokens", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) tokens.add(generateInvitationToken());
    expect(tokens.size).toBe(100);
  });

  it("treats future expiration as not expired", () => {
    const future = new Date(Date.now() + 60_000);
    expect(isTokenExpired(future)).toBe(false);
  });

  it("treats past expiration as expired", () => {
    const past = new Date(Date.now() - 60_000);
    expect(isTokenExpired(past)).toBe(true);
  });
});
