import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const APPLE_NONCE_COOKIE = "pm_apple_nonce";
export const APPLE_NONCE_TTL_S = 600;

// Single use per process (single VPS, like the rate limiter); entries expire with the cookie.
const used = new Map<string, number>();

export function newNonce(): string {
  return randomBytes(24).toString("base64url");
}

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The token's nonce claim matches the cookie nonce either as issued or as its SHA-256 hex. */
export function nonceMatches(cookieNonce: string | undefined, claim: unknown): boolean {
  if (!cookieNonce || typeof claim !== "string" || claim === "") return false;
  const hashed = createHash("sha256").update(cookieNonce).digest("hex");
  return safeEqual(claim, cookieNonce) || safeEqual(claim.toLowerCase(), hashed);
}

/** Marks the nonce as spent; false when it was already used. */
export function claimNonce(nonce: string, now = Date.now()): boolean {
  for (const [n, exp] of used) if (exp <= now) used.delete(n);
  if (used.has(nonce)) return false;
  used.set(nonce, now + APPLE_NONCE_TTL_S * 1000);
  return true;
}

export function resetNoncesForTests(): void {
  used.clear();
}
