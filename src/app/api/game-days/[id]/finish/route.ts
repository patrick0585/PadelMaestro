import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  finishGameDay,
  GameDayAlreadyFinishedError,
} from "@/lib/game-day/finish";
import { GameDayNotActiveError } from "@/lib/game-day/add-extra-match";
import { GameDayNotFoundError } from "@/lib/game-day/attendance";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  try {
    await finishGameDay(id, session.user.id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof GameDayNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (e instanceof GameDayAlreadyFinishedError) {
      return NextResponse.json({ error: "already_finished" }, { status: 409 });
    }
    if (e instanceof GameDayNotActiveError) {
      return NextResponse.json({ error: "not_active" }, { status: 409 });
    }
    throw e;
  }
}
