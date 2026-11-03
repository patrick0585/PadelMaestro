import { NextResponse } from "next/server";
import { rateLimitRequest } from "@/lib/rate-limit";
import { rateLimitedResponse } from "@/lib/rate-limit-response";
import { EmailTakenError } from "@/lib/account/errors";
import { InvitationInvalidError } from "@/lib/invitations/errors";
import { signupWithInvitation } from "@/lib/invitations/redeem";
import { signupSchema } from "@/lib/invitations/schemas";

export async function POST(req: Request) {
  const rl = rateLimitRequest(req, "signup", { windowMs: 3_600_000, max: 5 });
  if (!rl.allowed) return rateLimitedResponse(rl);

  const parsed = signupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { token, name, email, password } = parsed.data;

  try {
    const result = await signupWithInvitation({ token, name, email, password });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof EmailTakenError) {
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }
    if (e instanceof InvitationInvalidError) {
      return NextResponse.json({ error: "invitation_invalid", reason: e.reason }, { status: 410 });
    }
    throw e;
  }
}
