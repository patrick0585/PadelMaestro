import { NextResponse } from "next/server";
import { APPLE_NONCE_COOKIE, APPLE_NONCE_TTL_S, newNonce } from "@/lib/auth/apple/nonce";
import { rateLimitRequest } from "@/lib/rate-limit";
import { rateLimitedResponse } from "@/lib/rate-limit-response";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rl = rateLimitRequest(req, "apple-nonce", { windowMs: 60_000, max: 30 });
  if (!rl.allowed) return rateLimitedResponse(rl);
  const nonce = newNonce();
  const res = NextResponse.json({ nonce }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(APPLE_NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: APPLE_NONCE_TTL_S,
  });
  return res;
}
