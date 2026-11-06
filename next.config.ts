import type { NextConfig } from "next";

// Security headers are set here, not in Caddy, so they ship with the app.
// No CSP yet: Next's inline runtime scripts would need nonces first.
export const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // The share image reads its fonts from disk at runtime.
  outputFileTracingIncludes: {
    "/api/game-days/[id]/share-image": ["./assets/fonts/*.ttf"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
