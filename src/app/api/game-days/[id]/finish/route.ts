import { NextResponse } from "next/server";
import { guardGroupAdmin } from "@/lib/auth/route-guard";
import { findGroupGameDay } from "@/lib/game-day/group-scope";
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
  const g = await guardGroupAdmin();
  if (g.response) return g.response;

  const { id } = await ctx.params;
  if (!(await findGroupGameDay(g.ctx.groupId, id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    await finishGameDay(id, g.ctx.userId);
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
