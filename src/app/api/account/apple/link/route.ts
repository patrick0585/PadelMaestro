import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { rateLimit } from "@/lib/rate-limit";
import { rateLimitedResponse } from "@/lib/rate-limit-response";
import { linkAppleToPlayer, storeAppleRefreshToken } from "@/lib/account/apple";
import { exchangeAuthorizationCode } from "@/lib/auth/apple/api";
import { appleConfig } from "@/lib/auth/apple/config";
import { AppleAuthError, APPLE_ERROR_MESSAGES } from "@/lib/auth/apple/errors";
import { APPLE_NONCE_COOKIE, readCookie } from "@/lib/auth/apple/nonce";
import { verifyAppleIdentityToken } from "@/lib/auth/apple/verify";

const Schema = z.object({
  identityToken: z.string().min(1).max(8000),
  authorizationCode: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rl = rateLimit(`apple-link:${userId}`, { windowMs: 60_000, max: 5 });
  if (!rl.allowed) return rateLimitedResponse(rl);

  const cfg = appleConfig();
  if (!cfg) return NextResponse.json({ error: "apple_unavailable" }, { status: 503 });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  try {
    const identity = await verifyAppleIdentityToken(parsed.data.identityToken, {
      audiences: [cfg.bundleId, cfg.servicesId],
      cookieNonce: readCookie(req.headers.get("cookie"), APPLE_NONCE_COOKIE),
    });
    await linkAppleToPlayer({ playerId: userId, identity });
    if (parsed.data.authorizationCode) {
      const refresh = await exchangeAuthorizationCode(cfg, parsed.data.authorizationCode, identity.clientId);
      if (refresh) await storeAppleRefreshToken(userId, refresh, identity.clientId).catch(() => {});
    }
    const res = new NextResponse(null, { status: 204 });
    res.cookies.delete(APPLE_NONCE_COOKIE);
    return res;
  } catch (e) {
    if (e instanceof AppleAuthError) {
      const status = e.code === "apple_already_linked" ? 409 : 400;
      return NextResponse.json({ error: e.code, message: APPLE_ERROR_MESSAGES[e.code] }, { status });
    }
    throw e;
  }
}
