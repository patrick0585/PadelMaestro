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

  // www vs non-www: Caddy serves both padelmaestro.de and
  // www.padelmaestro.de, but AUTH_URL is only the apex. A phone that lands
  // on the www host sent Origin: https://www.… and got a 403 on every
  // mutation. The apex and its www sibling are the same site.
  describe("www / non-www are treated as the same site", () => {
    it("accepts the www origin when expected is the apex", () => {
      expect(
        isSameOriginMutation(
          "PUT",
          "/api/matches/abc",
          url,
          { origin: "https://www.padel.example.com", referer: null },
          expected,
        ),
      ).toBe(true);
    });

    it("accepts the apex origin when expected is the www host", () => {
      expect(
        isSameOriginMutation(
          "PUT",
          "/api/matches/abc",
          url,
          { origin: "https://padel.example.com", referer: null },
          "https://www.padel.example.com",
        ),
      ).toBe(true);
    });

    it("accepts a www referer when origin is missing", () => {
      expect(
        isSameOriginMutation(
          "POST",
          "/api/matches/abc",
          url,
          { origin: null, referer: "https://www.padel.example.com/game-day" },
          expected,
        ),
      ).toBe(true);
    });

    it("still rejects an unrelated subdomain", () => {
      expect(
        isSameOriginMutation(
          "POST",
          "/api/matches/abc",
          url,
          { origin: "https://evil.padel.example.com", referer: null },
          expected,
        ),
      ).toBe(false);
    });

    it("still rejects a look-alike host without the dotted www prefix", () => {
      expect(
        isSameOriginMutation(
          "POST",
          "/api/matches/abc",
          url,
          { origin: "https://wwwpadel.example.com", referer: null },
          expected,
        ),
      ).toBe(false);
    });

    it("accepts an uppercased Origin header (case-insensitive host)", () => {
      expect(
        isSameOriginMutation(
          "PUT",
          "/api/matches/abc",
          url,
          { origin: "HTTPS://WWW.PADEL.EXAMPLE.COM", referer: null },
          expected,
        ),
      ).toBe(true);
    });

    it("does not cross scheme when toggling www", () => {
      expect(
        isSameOriginMutation(
          "POST",
          "/api/matches/abc",
          url,
          { origin: "http://www.padel.example.com", referer: null },
          expected,
        ),
      ).toBe(false);
    });
  });
});
