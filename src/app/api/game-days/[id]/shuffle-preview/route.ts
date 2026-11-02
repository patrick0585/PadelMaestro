import { NextResponse } from "next/server";
import { guardGroupAdmin } from "@/lib/auth/route-guard";
import { findGroupGameDay } from "@/lib/game-day/group-scope";
import {
  shufflePreviewSeed,
  GameDayNotPlannedError,
} from "@/lib/game-day/shuffle-preview";

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
    const result = await shufflePreviewSeed(id, g.ctx.userId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GameDayNotPlannedError) {
      return NextResponse.json({ error: "not_planned" }, { status: 409 });
    }
    throw err;
  }
}
