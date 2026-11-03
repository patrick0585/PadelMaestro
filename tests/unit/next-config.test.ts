import { describe, it, expect } from "vitest";
import nextConfig, { securityHeaders } from "../../next.config";

describe("next.config security headers", () => {
  it("applies the security headers to every path", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    const keys = rules[0].headers.map((h) => h.key);
    expect(keys).toEqual([
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "X-Frame-Options",
      "Permissions-Policy",
    ]);
  });

  it("keeps referrers same-origin so invitation tokens in URLs never leave the site", () => {
    expect(securityHeaders.find((h) => h.key === "Referrer-Policy")?.value).toBe("same-origin");
    expect(securityHeaders.find((h) => h.key === "Strict-Transport-Security")?.value).toBe(
      "max-age=31536000",
    );
  });
});
