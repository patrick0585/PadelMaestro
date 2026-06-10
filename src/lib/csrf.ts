const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// The apex host and its `www.` sibling are the same site. Caddy serves
// both padelmaestro.de and www.padelmaestro.de, but AUTH_URL names only
// the apex — without this, a phone that landed on the www host sent
// `Origin: https://www.…` and was rejected on every mutation. Only the
// exact www/non-www pair is added (same scheme + port); arbitrary
// subdomains stay cross-origin. Assumes `expected` is an apex or a single
// `www.`-prefixed host (the only shapes AUTH_URL realistically takes).
function allowedOrigins(expectedOrigin: string): Set<string> {
  const origins = new Set<string>([expectedOrigin.toLowerCase()]);
  try {
    const u = new URL(expectedOrigin);
    const sibling = u.hostname.startsWith("www.")
      ? u.hostname.slice(4)
      : `www.${u.hostname}`;
    // Guard the degenerate `www.` → "" case and any no-op.
    if (sibling && sibling !== u.hostname) {
      u.hostname = sibling;
      origins.add(u.origin.toLowerCase());
    }
  } catch {
    // expectedOrigin was not a parseable URL — keep it as the sole entry.
  }
  return origins;
}

export function isSameOriginMutation(
  method: string,
  pathname: string,
  requestUrl: string,
  headers: { origin: string | null; referer: string | null },
  allowedOriginOverride?: string,
): boolean {
  if (!pathname.startsWith("/api/")) return true;
  if (!MUTATION_METHODS.has(method.toUpperCase())) return true;

  const expected = allowedOriginOverride
    ?? process.env.AUTH_URL
    ?? process.env.NEXTAUTH_URL
    ?? new URL(requestUrl).origin;

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(expected).origin;
  } catch {
    expectedOrigin = expected;
  }

  const allowed = allowedOrigins(expectedOrigin);

  // Origin/host are case-insensitive per the URL spec; normalise so a
  // proxy that uppercases the header cannot trip a false CSRF rejection.
  if (headers.origin) return allowed.has(headers.origin.toLowerCase());

  if (headers.referer) {
    try {
      return allowed.has(new URL(headers.referer).origin.toLowerCase());
    } catch {
      return false;
    }
  }

  // Browsers always send at least one of Origin or Referer for same-site
  // fetch/XHR, so missing both means a non-browser client or an actor that
  // stripped them — treat as CSRF rather than softening.
  return false;
}
