import { NextResponse } from "next/server";
import { guardGroupAdmin } from "@/lib/auth/route-guard";
import { findGroupGameDay } from "@/lib/game-day/group-scope";
import { deleteGameDay, GameDayNotDeletableError } from "@/lib/game-day/delete";
import { GameDayNotFoundError } from "@/lib/game-day/attendance";

export async function DELETE(
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
    await deleteGameDay(id, g.ctx.userId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof GameDayNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (e instanceof GameDayNotDeletableError) {
      return NextResponse.json({ error: "not_deletable" }, { status: 409 });
    }
    throw e;
  }
}
