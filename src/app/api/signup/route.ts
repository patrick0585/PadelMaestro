import { NextResponse } from "next/server";
import { rateLimitPeek, rateLimitRecord, rateLimitRequest } from "@/lib/rate-limit";
import { normaliseEmail } from "@/lib/auth/email";
import { rateLimitedResponse } from "@/lib/rate-limit-response";
import { EmailTakenError } from "@/lib/account/errors";
import { signupOpen } from "@/lib/account/signup";
import { publicSignupEnabled } from "@/lib/flags";
import { InvitationInvalidError } from "@/lib/invitations/errors";
import { signupWithInvitation } from "@/lib/invitations/redeem";
import { openSignupSchema, signupSchema } from "@/lib/invitations/schemas";

// Caps across all networks and per (possibly foreign) address. Only successful signups count,
// so junk or rejected requests can neither lock out real users nor block someone's address.
const ALL = { key: "signup:all", opts: { windowMs: 3_600_000, max: 100 } };
const perAddress = (email: string) => ({
  key: `signup-email:${normaliseEmail(email)}`,
  opts: { windowMs: 24 * 3_600_000, max: 3 },
});

function capsReached(email: string): Response | null {
  for (const cap of [ALL, perAddress(email)]) {
    const rl = rateLimitPeek(cap.key, cap.opts);
    if (!rl.allowed) return rateLimitedResponse(rl);
  }
  return null;
}

function countSignup(email: string): void {
  rateLimitRecord(ALL.key);
  rateLimitRecord(perAddress(email).key);
}

/** Signup with an invitation token, or without one while PUBLIC_SIGNUP is on. */
export async function POST(req: Request) {
  const rl = rateLimitRequest(req, "signup", { windowMs: 3_600_000, max: 5 });
  if (!rl.allowed) return rateLimitedResponse(rl);

  const body: unknown = await req.json().catch(() => null);
  const withToken = typeof body === "object" && body !== null && "token" in body;
  if (!withToken && !publicSignupEnabled()) {
    return NextResponse.json({ error: "signup_closed" }, { status: 403 });
  }

  try {
    if (withToken) {
      const parsed = signupSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
      const { token, name, email, password } = parsed.data;
      const limited = capsReached(email);
      if (limited) return limited;
      const result = await signupWithInvitation({ token, name, email, password });
      countSignup(email);
      return NextResponse.json(result, { status: 201 });
    }
    const parsed = openSignupSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const { name, email, password } = parsed.data;
    const limited = capsReached(email);
    if (limited) return limited;
    const result = await signupOpen({ name, email, password });
    countSignup(email);
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
