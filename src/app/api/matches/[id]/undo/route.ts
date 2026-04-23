import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  undoScore,
  NoScoreToUndoError,
  UndoNotAllowedError,
  UndoWindowExpiredError,
} from "@/lib/match/undo";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const match = await undoScore({ matchId: id, actorId: session.user.id });
    return NextResponse.json({ match });
  } catch (err) {
    if (err instanceof NoScoreToUndoError) {
      return NextResponse.json({ error: "no_score" }, { status: 409 });
    }
    if (err instanceof UndoNotAllowedError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (err instanceof UndoWindowExpiredError) {
      return NextResponse.json({ error: "undo_window_expired" }, { status: 409 });
    }
    throw err;
  }
}
