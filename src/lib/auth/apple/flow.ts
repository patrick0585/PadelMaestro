import type { JWTVerifyGetKey } from "jose";
import { storeAppleRefreshToken } from "@/lib/account/apple";
import { exchangeAuthorizationCode } from "./api";
import type { AppleConfig } from "./config";
import { readNonceCookie } from "./nonce";
import { verifyAppleIdentityToken, type AppleIdentity } from "./verify";

/** Verifies an identity token against the signed nonce cookie of the request. */
export function verifyRequestIdentity(
  cfg: AppleConfig,
  request: Request | undefined,
  identityToken: string,
  keys?: JWTVerifyGetKey,
): Promise<AppleIdentity> {
  return verifyAppleIdentityToken(identityToken, {
    audiences: [cfg.bundleId, cfg.servicesId],
    cookieNonce: readNonceCookie(request?.headers.get("cookie")),
    keys,
  });
}

/** Best effort: a failed exchange or write leaves the account without a refresh token. */
export async function exchangeAndStoreRefreshToken(
  cfg: AppleConfig,
  playerId: string,
  authorizationCode: string,
  clientId: string,
): Promise<void> {
  const refresh = await exchangeAuthorizationCode(cfg, authorizationCode, clientId);
  if (refresh) await storeAppleRefreshToken(playerId, refresh, clientId).catch(() => {});
}
