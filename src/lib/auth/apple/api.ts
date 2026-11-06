import { importPKCS8, SignJWT } from "jose";
import type { AppleConfig } from "./config";
import { APPLE_ISSUER } from "./verify";

const TIMEOUT_MS = 4000;

export async function appleClientSecret(cfg: AppleConfig, clientId: string): Promise<string> {
  const key = await importPKCS8(cfg.privateKey, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: cfg.keyId })
    .setIssuer(cfg.teamId)
    .setSubject(clientId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

async function postForm(path: string, body: Record<string, string>): Promise<Response> {
  return fetch(`${APPLE_ISSUER}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** Trades the authorization code for a refresh token; null on any failure (best effort). */
export async function exchangeAuthorizationCode(
  cfg: AppleConfig,
  code: string,
  clientId: string,
): Promise<string | null> {
  try {
    const res = await postForm("/auth/token", {
      client_id: clientId,
      client_secret: await appleClientSecret(cfg, clientId),
      code,
      grant_type: "authorization_code",
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const token = (json as { refresh_token?: unknown } | null)?.refresh_token;
    return typeof token === "string" && token ? token : null;
  } catch {
    return null;
  }
}

/** Revokes the user's tokens at Apple; never throws. */
export async function revokeRefreshToken(
  cfg: AppleConfig,
  refreshToken: string,
  clientId: string,
): Promise<boolean> {
  try {
    const res = await postForm("/auth/revoke", {
      client_id: clientId,
      client_secret: await appleClientSecret(cfg, clientId),
      token: refreshToken,
      token_type_hint: "refresh_token",
    });
    return res.ok;
  } catch {
    return false;
  }
}
