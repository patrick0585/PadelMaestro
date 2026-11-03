import { NextResponse } from "next/server";

export function rateLimitedResponse(rl: { retryAfterMs: number }) {
  return NextResponse.json(
    { error: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
  );
}
