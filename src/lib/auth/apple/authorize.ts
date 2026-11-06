import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimitRequest } from "@/lib/rate-limit";
import { buildAuthorizedUser, type AuthorizedUser } from "@/lib/auth/authorize";
import { resolveAppleAccount, storeAppleRefreshToken } from "@/lib/account/apple";
import { exchangeAuthorizationCode } from "./api";
import { appleConfig } from "./config";
import { AppleAuthError } from "./errors";
import { APPLE_NONCE_COOKIE, readCookie } from "./nonce";
import { verifyAppleIdentityToken } from "./verify";
import type { JWTVerifyGetKey } from "jose";

const optionalText = z
  .string()
  .max(500)
  .optional()
  .transform((v) => v?.trim() || undefined);

const CredentialsSchema = z.object({
  identityToken: z.string().min(1).max(8000),
  authorizationCode: optionalText,
  givenName: optionalText,
  familyName: optionalText,
  invitationToken: optionalText,
});

/** Clears the nonce cookie when a response context exists; the nonce is spent server-side anyway. */
async function dropNonceCookie(): Promise<void> {
  try {
    (await cookies()).delete(APPLE_NONCE_COOKIE);
  } catch {
    // outside a request scope (tests)
  }
}

export async function authorizeApple(
  raw: unknown,
  request: Request | undefined,
  deps: { keys?: JWTVerifyGetKey } = {},
): Promise<AuthorizedUser | null> {
  const cfg = appleConfig();
  if (!cfg) throw new AppleAuthError("apple_unavailable");
  const parsed = CredentialsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const input = parsed.data;
  if (request) {
    const rl = rateLimitRequest(request, "login-apple", { windowMs: 60_000, max: 10 });
    if (!rl.allowed) throw new AppleAuthError("rate_limited");
  }

  const cookieNonce = readCookie(request?.headers.get("cookie"), APPLE_NONCE_COOKIE);
  const identity = await verifyAppleIdentityToken(input.identityToken, {
    audiences: [cfg.bundleId, cfg.servicesId],
    cookieNonce,
    keys: deps.keys,
  });
  await dropNonceCookie();

  const resolution = await resolveAppleAccount({
    identity,
    givenName: input.givenName,
    familyName: input.familyName,
    invitationToken: input.invitationToken,
  });

  if (input.authorizationCode && resolution.needsRefreshToken) {
    const refresh = await exchangeAuthorizationCode(cfg, input.authorizationCode, identity.clientId);
    if (refresh) {
      await storeAppleRefreshToken(resolution.playerId, refresh, identity.clientId).catch(() => {});
    }
  }

  const player = await prisma.player.findUniqueOrThrow({
    where: { id: resolution.playerId },
    select: { id: true, email: true, name: true, username: true, sessionVersion: true },
  });
  return buildAuthorizedUser(player);
}
