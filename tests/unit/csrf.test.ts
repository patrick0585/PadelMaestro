import { describe, it, expect } from "vitest";
import { isSameOriginMutation } from "@/lib/csrf";

const expected = "https://padel.example.com";
const url = "https://padel.example.com/api/matches/abc";

describe("isSameOriginMutation", () => {
  it("allows GET on API without origin check", () => {
    expect(
      isSameOriginMutation("GET", "/api/matches/abc", url, { origin: null, referer: null }, expected),
    ).toBe(true);
  });

  it("allows non-API routes without origin check", () => {
    expect(
      isSameOriginMutation("POST", "/login", url, { origin: null, referer: null }, expected),
    ).toBe(true);
  });

  it("allows same-origin POST", () => {
    expect(
      isSameOriginMutation(
        "POST",
        "/api/matches/abc",
        url,
        { origin: expected, referer: null },
        expected,
      ),
    ).toBe(true);
  });

  it("rejects cross-origin POST", () => {
    expect(
      isSameOriginMutation(
        "POST",
        "/api/matches/abc",
        url,
        { origin: "https://evil.com", referer: null },
        expected,
      ),
    ).toBe(false);
  });

  it("falls back to referer when origin is missing", () => {
    expect(
      isSameOriginMutation(
        "PUT",
        "/api/matches/abc",
        url,
        { origin: null, referer: `${expected}/some/page` },
        expected,
      ),
    ).toBe(true);
  });

  it("rejects when both origin and referer are missing", () => {
    expect(
      isSameOriginMutation(
        "POST",
        "/api/matches/abc",
        url,
        { origin: null, referer: null },
        expected,
      ),
    ).toBe(false);
  });

  it("rejects cross-origin referer", () => {
    expect(
      isSameOriginMutation(
        "POST",
        "/api/matches/abc",
        url,
        { origin: null, referer: "https://evil.com/x" },
        expected,
      ),
    ).toBe(false);
  });
});
