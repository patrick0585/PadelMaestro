import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  lockRoster,
  GameDayAlreadyLockedError,
  InsufficientPlayersError,
  TooManyPlayersError,
} from "@/lib/game-day/lock";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  try {
    const day = await lockRoster(id, session.user.id);
    return NextResponse.json({ gameDay: day });
  } catch (err) {
    if (err instanceof GameDayAlreadyLockedError) {
      return NextResponse.json({ error: "already_locked" }, { status: 409 });
    }
    if (err instanceof InsufficientPlayersError) {
      return NextResponse.json({ error: "too_few_players" }, { status: 409 });
    }
    if (err instanceof TooManyPlayersError) {
      return NextResponse.json({ error: "too_many_players" }, { status: 409 });
    }
    throw err;
  }
}
