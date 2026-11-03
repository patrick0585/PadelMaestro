import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { rateLimitRequest } from "@/lib/rate-limit";
import { rateLimitedResponse } from "@/lib/rate-limit-response";
import { sendVerification } from "@/lib/account/email-verification";
import { PlayerNotFoundError } from "@/lib/account/errors";
import { MailSendError } from "@/lib/mail/send";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = rateLimitRequest(req, `profile-email-resend:${session.user.id}`, {
    windowMs: 3_600_000,
    max: 3,
  });
  if (!rl.allowed) return rateLimitedResponse(rl);

  try {
    await sendVerification({ playerId: session.user.id });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (e instanceof MailSendError) {
      return NextResponse.json({ error: "mail_failed" }, { status: 503 });
    }
    throw e;
  }
}
