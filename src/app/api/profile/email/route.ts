import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { rateLimit } from "@/lib/rate-limit";
import { rateLimitedResponse } from "@/lib/rate-limit-response";
import { requestEmailChange } from "@/lib/account/email-verification";
import { EmailTakenError, PlayerNotFoundError } from "@/lib/account/errors";
import { emailField } from "@/lib/account/schemas";
import { MailSendError } from "@/lib/mail/send";

const Schema = z.object({ email: emailField });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Keyed by account only, so switching IPs does not reset the budget.
  const rl = rateLimit(`profile-email:${session.user.id}`, {
    windowMs: 3_600_000,
    max: 5,
  });
  if (!rl.allowed) return rateLimitedResponse(rl);

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    await requestEmailChange({ playerId: session.user.id, newEmail: parsed.data.email });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof EmailTakenError) {
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (e instanceof MailSendError) {
      return NextResponse.json({ error: "mail_failed" }, { status: 503 });
    }
    throw e;
  }
}
