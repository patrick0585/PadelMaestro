import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  shufflePreviewSeed,
  GameDayNotPlannedError,
} from "@/lib/game-day/shuffle-preview";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  try {
    const result = await shufflePreviewSeed(id, session.user.id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GameDayNotPlannedError) {
      return NextResponse.json({ error: "not_planned" }, { status: 409 });
    }
    throw err;
  }
}
