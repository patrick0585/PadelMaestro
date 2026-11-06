import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function signature(nonce: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`apple-nonce:${nonce}`).digest("base64url");
}

/** Cookie value `<nonce>.<hmac>`: only the server can mint a nonce the verifier accepts. */
export function signNonce(nonce: string): string {
  return `${nonce}.${signature(nonce)}`;
}

/** The nonce inside a signed cookie value; undefined when missing, unsigned or forged. */
export function openNonce(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const nonce = value.slice(0, dot);
  try {
    return safeEqual(value.slice(dot + 1), signature(nonce)) ? nonce : undefined;
  } catch {
    return undefined;
  }
}

export function readNonceCookie(header: string | null | undefined): string | undefined {
  return openNonce(readCookie(header, APPLE_NONCE_COOKIE));
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
