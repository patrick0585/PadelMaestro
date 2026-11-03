import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { rateLimitRequest } from "@/lib/rate-limit";
import { rateLimitedResponse } from "@/lib/rate-limit-response";
import { InvitationInvalidError } from "@/lib/invitations/errors";
import { joinWithInvitation } from "@/lib/invitations/redeem";
import { joinSchema } from "@/lib/invitations/schemas";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = rateLimitRequest(req, "invitation-join", { windowMs: 60_000, max: 30 });
  if (!rl.allowed) return rateLimitedResponse(rl);

  const parsed = joinSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const result = await joinWithInvitation({
      token: parsed.data.token,
      playerId: session.user.id,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof InvitationInvalidError) {
      return NextResponse.json({ error: "invitation_invalid", reason: e.reason }, { status: 410 });
    }
    throw e;
  }
}
