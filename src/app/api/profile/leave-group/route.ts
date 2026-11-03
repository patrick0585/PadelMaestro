import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMember } from "@/lib/auth/route-guard";
import { leaveGroup } from "@/lib/group/leave";
import { ActiveParticipationError } from "@/lib/players/delete";
import { LastAdminError, OwnerProtectedError, PlayerNotFoundError } from "@/lib/players/errors";

const Body = z.object({ groupId: z.string().uuid() });

export async function POST(req: Request) {
  const { ctx, response } = await guardMember();
  if (response) return response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (parsed.data.groupId !== ctx.groupId) {
    return NextResponse.json({ error: "stale_group" }, { status: 409 });
  }

  try {
    await leaveGroup({ groupId: ctx.groupId, playerId: ctx.userId });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof OwnerProtectedError) {
      return NextResponse.json({ error: "owner_protected" }, { status: 409 });
    }
    if (e instanceof LastAdminError) {
      return NextResponse.json({ error: "last_admin" }, { status: 409 });
    }
    if (e instanceof ActiveParticipationError) {
      return NextResponse.json({ error: "active_participation" }, { status: 409 });
    }
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
}
