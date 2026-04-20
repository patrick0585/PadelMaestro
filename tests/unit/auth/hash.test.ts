import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/hash";

describe("password hashing", () => {
  it("hashes a password to a non-empty string distinct from the input", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toBeTruthy();
    expect(hash).not.toBe("correct horse battery staple");
    expect(hash.length).toBeGreaterThan(20);
  });

  it("produces different hashes for the same password (salt)", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("secret123");
    expect(await verifyPassword("secret123", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("secret123");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
