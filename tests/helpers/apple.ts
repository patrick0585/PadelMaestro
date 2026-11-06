import { createLocalJWKSet, exportJWK, exportPKCS8, generateKeyPair, SignJWT, type JWTPayload } from "jose";

import { APPLE_NONCE_COOKIE, signNonce } from "@/lib/auth/apple/nonce";

export const BUNDLE_ID = "de.padelmaestro.app";
export const SERVICES_ID = "de.padelmaestro.web";

export async function appleTestSetup() {
  const rsa = await generateKeyPair("RS256", { extractable: true });
  const jwk = { ...(await exportJWK(rsa.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  const keys = createLocalJWKSet({ keys: [jwk] });

  const ec = await generateKeyPair("ES256", { extractable: true });
  const privateKeyPem = await exportPKCS8(ec.privateKey);

  async function token(
    claims: JWTPayload = {},
    o: { aud?: string; iss?: string; exp?: string | number; iat?: number; key?: CryptoKey } = {},
  ): Promise<string> {
    return new SignJWT({ email_verified: "true", ...claims })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(o.iss ?? "https://appleid.apple.com")
      .setAudience(o.aud ?? BUNDLE_ID)
      .setIssuedAt(o.iat)
      .setExpirationTime(o.exp ?? "10m")
      .sign(o.key ?? rsa.privateKey);
  }

  return { keys, token, privateKeyPem, ecPublicKey: ec.publicKey, rsaOther: () => generateKeyPair("RS256") };
}

export function setAppleEnv(privateKeyPem: string) {
  process.env.APPLE_TEAM_ID = "TEAM123456";
  process.env.APPLE_KEY_ID = "KEY1234567";
  process.env.APPLE_PRIVATE_KEY = privateKeyPem;
  process.env.APPLE_BUNDLE_ID = BUNDLE_ID;
  process.env.APPLE_SERVICES_ID = SERVICES_ID;
}

export function clearAppleEnv() {
  for (const k of ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY", "APPLE_PRIVATE_KEY_PATH", "APPLE_BUNDLE_ID", "APPLE_SERVICES_ID"]) {
    delete process.env[k];
  }
}

/** Cookie header carrying a server-signed nonce, as the nonce endpoint would set it. */
export function nonceCookie(nonce: string): string {
  return `${APPLE_NONCE_COOKIE}=${signNonce(nonce)}`;
}
