import { NextResponse } from "next/server";
import { guardMember } from "@/lib/auth/route-guard";
import { leaveGroup } from "@/lib/group/leave";
import { ActiveParticipationError } from "@/lib/players/delete";
import { LastAdminError, OwnerProtectedError, PlayerNotFoundError } from "@/lib/players/errors";

export async function POST() {
  const { ctx, response } = await guardMember();
  if (response) return response;

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
