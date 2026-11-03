import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimitRequest } from "@/lib/rate-limit";
import { rateLimitedResponse } from "@/lib/rate-limit-response";
import { confirmEmailToken } from "@/lib/account/email-verification";
import { EmailTakenError, InvalidTokenError } from "@/lib/account/errors";
import { tokenField } from "@/lib/account/schemas";

const Schema = z.object({ token: tokenField });

export async function POST(req: Request) {
  const rl = rateLimitRequest(req, "email-confirm", { windowMs: 60_000, max: 30 });
  if (!rl.allowed) return rateLimitedResponse(rl);

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  try {
    const { email } = await confirmEmailToken(parsed.data.token);
    return NextResponse.json({ email });
  } catch (e) {
    if (e instanceof InvalidTokenError) {
      return NextResponse.json({ error: "invalid_token" }, { status: 400 });
    }
    if (e instanceof EmailTakenError) {
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }
    throw e;
  }
}
