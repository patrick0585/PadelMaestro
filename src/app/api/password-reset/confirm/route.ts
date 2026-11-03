import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimitRequest } from "@/lib/rate-limit";
import { rateLimitedResponse } from "@/lib/rate-limit-response";
import { confirmPasswordReset } from "@/lib/account/password-reset";
import { InvalidTokenError } from "@/lib/account/errors";
import { newPasswordField, tokenField } from "@/lib/account/schemas";

const Schema = z.object({ token: tokenField, newPassword: newPasswordField });

export async function POST(req: Request) {
  const rl = rateLimitRequest(req, "password-reset-confirm", { windowMs: 60_000, max: 30 });
  if (!rl.allowed) return rateLimitedResponse(rl);

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    await confirmPasswordReset(parsed.data);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof InvalidTokenError) {
      return NextResponse.json({ error: "invalid_token" }, { status: 400 });
    }
    throw e;
  }
}
