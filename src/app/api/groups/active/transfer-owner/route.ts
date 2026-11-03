import { NextResponse } from "next/server";
import { z } from "zod";
import { guardOwner } from "@/lib/auth/route-guard";
import { ForbiddenError } from "@/lib/auth/group-context";
import { PlayerNotFoundError } from "@/lib/players/errors";
import {
  SelfTransferError,
  TargetCannotLoginError,
  transferOwnership,
} from "@/lib/group/transfer";

const Body = z.object({ playerId: z.string().uuid() });

export async function POST(req: Request) {
  const g = await guardOwner();
  if (g.response) return g.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    await transferOwnership({
      groupId: g.ctx.groupId,
      actorId: g.ctx.userId,
      newOwnerId: parsed.data.playerId,
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (e instanceof SelfTransferError) {
      return NextResponse.json({ error: "self_transfer" }, { status: 409 });
    }
    if (e instanceof TargetCannotLoginError) {
      return NextResponse.json({ error: "target_cannot_login" }, { status: 409 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw e;
  }
}
