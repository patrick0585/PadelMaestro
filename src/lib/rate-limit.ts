// Per-process in-memory buckets. Resets on restart and is NOT shared across
// instances — fine for the single-VPS deployment; switch to Redis/Upstash if
// we ever run more than one Next.js process.
const buckets = new Map<string, number[]>();

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export function rateLimit(
  key: string,
  opts: RateLimitOptions,
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const cutoff = now - opts.windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= opts.max) {
    const oldest = hits[0];
    return { allowed: false, retryAfterMs: opts.windowMs - (now - oldest) };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { allowed: true, retryAfterMs: 0 };
}

export function rateLimitRequest(
  req: Request,
  scope: string,
  opts: RateLimitOptions,
): { allowed: boolean; retryAfterMs: number } {
  return rateLimit(`${scope}:${clientIp(req)}`, opts);
}

export function rateLimitResetForTests() {
  buckets.clear();
}
