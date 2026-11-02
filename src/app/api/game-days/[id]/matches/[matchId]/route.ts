import { NextResponse } from "next/server";
import { guardGroupAdmin } from "@/lib/auth/route-guard";
import { findGroupGameDay } from "@/lib/game-day/group-scope";
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
  const g = await guardGroupAdmin();
  if (g.response) return g.response;

  const { id, matchId } = await ctx.params;
  if (!(await findGroupGameDay(g.ctx.groupId, id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    await removeExtraMatch(id, matchId, g.ctx.userId);
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
