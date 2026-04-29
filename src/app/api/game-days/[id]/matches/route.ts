import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  addExtraMatch,
  GameDayNotActiveError,
} from "@/lib/game-day/add-extra-match";
import { GameDayNotFoundError } from "@/lib/game-day/attendance";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;

  if (!session.user.isAdmin) {
    // Excluding soft-deleted players defends against a stale account whose
    // GameDayParticipant row still exists.
    const participant = await prisma.gameDayParticipant.findFirst({
      where: {
        gameDayId: id,
        playerId: session.user.id,
        player: { deletedAt: null },
      },
      select: { attendance: true },
    });
    const isOnRoster =
      participant?.attendance === "confirmed" || participant?.attendance === "joker";
    if (!isOnRoster) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const match = await addExtraMatch(id, session.user.id);
    return NextResponse.json({ match }, { status: 201 });
  } catch (e) {
    if (e instanceof GameDayNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (e instanceof GameDayNotActiveError) {
      return NextResponse.json({ error: "not_active" }, { status: 409 });
    }
    throw e;
  }
}
