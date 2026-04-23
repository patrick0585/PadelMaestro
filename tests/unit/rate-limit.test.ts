import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, rateLimitResetForTests } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => rateLimitResetForTests());

  it("allows requests below the limit", () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimit("k", { windowMs: 1000, max: 3 }).allowed).toBe(true);
    }
  });

  it("rejects the N+1th request in window", () => {
    for (let i = 0; i < 3; i++) rateLimit("k", { windowMs: 1000, max: 3 });
    const r = rateLimit("k", { windowMs: 1000, max: 3 });
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it("keeps buckets separate by key", () => {
    for (let i = 0; i < 3; i++) rateLimit("a", { windowMs: 1000, max: 3 });
    expect(rateLimit("a", { windowMs: 1000, max: 3 }).allowed).toBe(false);
    expect(rateLimit("b", { windowMs: 1000, max: 3 }).allowed).toBe(true);
  });
});
