import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, rateLimitRequest } from "@/lib/rate-limit";
import { rateLimitedResponse } from "@/lib/rate-limit-response";
import { requestPasswordReset } from "@/lib/account/password-reset";
import { emailField } from "@/lib/account/schemas";
import { MailSendError } from "@/lib/mail/send";

const Schema = z.object({ email: emailField });

export async function POST(req: Request) {
  const ipLimit = rateLimitRequest(req, "password-reset-request", {
    windowMs: 3_600_000,
    max: 10,
  });
  if (!ipLimit.allowed) return rateLimitedResponse(ipLimit);

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const emailLimit = rateLimit(`password-reset-email:${parsed.data.email}`, {
    windowMs: 3_600_000,
    max: 3,
  });
  if (!emailLimit.allowed) return rateLimitedResponse(emailLimit);

  try {
    await requestPasswordReset(parsed.data.email);
  } catch (e) {
    if (e instanceof MailSendError) {
      return NextResponse.json({ error: "mail_failed" }, { status: 503 });
    }
    throw e;
  }
  return new NextResponse(null, { status: 204 });
}
