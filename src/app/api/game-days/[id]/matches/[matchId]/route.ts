import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  removeExtraMatch,
  MatchNotFoundError,
  NotAnExtraMatchError,
} from "@/lib/game-day/remove-extra-match";
import { GameDayNotActiveError } from "@/lib/game-day/add-extra-match";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; matchId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  // Removal is destructive and can change the day's standings — admin only,
  // unlike adding a match which confirmed/joker players may also do.
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, matchId } = await ctx.params;

  try {
    await removeExtraMatch(id, matchId, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof MatchNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (e instanceof GameDayNotActiveError) {
      return NextResponse.json({ error: "not_active" }, { status: 409 });
    }
    if (e instanceof NotAnExtraMatchError) {
      return NextResponse.json({ error: "not_an_extra_match" }, { status: 422 });
    }
    throw e;
  }
}
