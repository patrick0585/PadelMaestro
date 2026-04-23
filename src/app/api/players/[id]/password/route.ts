import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { rateLimitRequest } from "@/lib/rate-limit";
import { resetPlayerPassword, PlayerNotFoundError } from "@/lib/players/reset-password";

// Cap at 72 bytes — bcrypt silently truncates longer inputs.
const Schema = z.object({ password: z.string().min(8).max(72) });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const rl = rateLimitRequest(req, `admin-password-reset:${session.user.id}`, {
    windowMs: 60_000,
    max: 20,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  try {
    await resetPlayerPassword({
      playerId: id,
      password: parsed.data.password,
      actorId: session.user.id,
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
}
