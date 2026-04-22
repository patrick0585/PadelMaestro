import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteGameDay, GameDayNotDeletableError } from "@/lib/game-day/delete";
import { GameDayNotFoundError } from "@/lib/game-day/attendance";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  try {
    await deleteGameDay(id, session.user.id);
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
