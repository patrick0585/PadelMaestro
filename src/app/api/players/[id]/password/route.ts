import { NextResponse } from "next/server";
import { z } from "zod";
import { guardGroupAdmin } from "@/lib/auth/route-guard";
import { rateLimitRequest } from "@/lib/rate-limit";
import { resetPlayerPassword, PlayerNotFoundError } from "@/lib/players/reset-password";
import { OwnerProtectedError, SharedAccountError } from "@/lib/players/errors";

// Cap at 72 bytes — bcrypt silently truncates longer inputs.
const Schema = z.object({ password: z.string().min(8).max(72) });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardGroupAdmin();
  if (g.response) return g.response;
  const rl = rateLimitRequest(req, `admin-password-reset:${g.ctx.userId}`, {
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
      groupId: g.ctx.groupId,
      playerId: id,
      password: parsed.data.password,
      actorId: g.ctx.userId,
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (e instanceof SharedAccountError) {
      return NextResponse.json({ error: "account_shared" }, { status: 409 });
    }
    if (e instanceof OwnerProtectedError) {
      return NextResponse.json({ error: "owner_protected" }, { status: 409 });
    }
    throw e;
  }
}
