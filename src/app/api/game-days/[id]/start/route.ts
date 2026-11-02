import { NextResponse } from "next/server";
import { guardGroupAdmin } from "@/lib/auth/route-guard";
import { findGroupGameDay } from "@/lib/game-day/group-scope";
import {
  startGameDay,
  GameDayAlreadyStartedError,
  InsufficientPlayersError,
  TooManyPlayersError,
} from "@/lib/game-day/start";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const g = await guardGroupAdmin();
  if (g.response) return g.response;

  const { id } = await ctx.params;
  if (!(await findGroupGameDay(g.ctx.groupId, id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const day = await startGameDay(id, g.ctx.userId);
    return NextResponse.json({ gameDay: day });
  } catch (err) {
    if (err instanceof GameDayAlreadyStartedError) {
      return NextResponse.json({ error: "already_started" }, { status: 409 });
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
