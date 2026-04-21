import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  joinGameDay,
  GameDayNotFoundError,
  GameDayLockedError,
  PlayerNotFoundError,
} from "@/lib/game-day/attendance";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const participant = await joinGameDay(id, session.user.id);
    return NextResponse.json({ participant });
  } catch (e) {
    if (e instanceof GameDayNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (e instanceof GameDayLockedError) {
      return NextResponse.json({ error: "locked" }, { status: 409 });
    }
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "inactive_account" }, { status: 401 });
    }
    throw e;
  }
}
