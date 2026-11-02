import { NextResponse } from "next/server";
import { guardMember } from "@/lib/auth/route-guard";
import { findGroupGameDay } from "@/lib/game-day/group-scope";
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
  const g = await guardMember();
  if (g.response) return g.response;

  const { id } = await ctx.params;
  if (!(await findGroupGameDay(g.ctx.groupId, id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const participant = await joinGameDay(id, g.ctx.userId);
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
