const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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

  if (headers.origin) return headers.origin === expectedOrigin;

  if (headers.referer) {
    try {
      return new URL(headers.referer).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  return false;
}
