import { describe, it, expect } from "vitest";
import nextConfig, { securityHeaders } from "../../next.config";

describe("next.config security headers", () => {
  it("applies the security headers to every path", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    expect(Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]))).toEqual({
      "Strict-Transport-Security": "max-age=31536000",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
  });

  it("never commits subdomains to HSTS (other projects live on subdomains of the same host)", () => {
    const hsts = securityHeaders.find((h) => h.key === "Strict-Transport-Security")?.value ?? "";
    expect(hsts).not.toMatch(/includeSubDomains/i);
  });
});
