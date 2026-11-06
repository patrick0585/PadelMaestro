import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { AppleAuthError } from "./errors";
import { claimNonce, nonceMatches } from "./nonce";

export const APPLE_ISSUER = "https://appleid.apple.com";
const JWKS_URL = new URL("https://appleid.apple.com/auth/keys");

export interface AppleIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  /** The audience the token was issued for: bundle ID (native) or services ID (web). */
  clientId: string;
}

let remoteKeys: JWTVerifyGetKey | undefined;
function defaultKeys(): JWTVerifyGetKey {
  remoteKeys ??= createRemoteJWKSet(JWKS_URL, { timeoutDuration: 5000 });
  return remoteKeys;
}

/**
 * Verifies signature, issuer, audience and expiry, then the nonce against the cookie value
 * (and spends it). Any failure is an `apple_invalid_token`.
 */
export async function verifyAppleIdentityToken(
  token: string,
  opts: {
    audiences: string[];
    cookieNonce: string | undefined;
    keys?: JWTVerifyGetKey;
  },
): Promise<AppleIdentity> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, opts.keys ?? defaultKeys(), {
      issuer: APPLE_ISSUER,
      audience: opts.audiences,
      algorithms: ["RS256"],
    }));
  } catch {
    throw new AppleAuthError("apple_invalid_token");
  }
  if (!payload.sub || typeof payload.aud !== "string") throw new AppleAuthError("apple_invalid_token");
  if (!nonceMatches(opts.cookieNonce, payload.nonce) || !claimNonce(opts.cookieNonce!)) {
    throw new AppleAuthError("apple_invalid_token");
  }
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
  return {
    sub: payload.sub,
    email: email || null,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    clientId: payload.aud,
  };
}
