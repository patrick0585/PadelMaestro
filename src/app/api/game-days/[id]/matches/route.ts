import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardMember } from "@/lib/auth/route-guard";
import { isAdminRole } from "@/lib/auth/roles";
import { findGroupGameDay } from "@/lib/game-day/group-scope";
import {
  addExtraMatch,
  GameDayNotActiveError,
} from "@/lib/game-day/add-extra-match";
import { GameDayNotFoundError } from "@/lib/game-day/attendance";

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

  if (!isAdminRole(g.ctx.role)) {
    // Excluding soft-deleted players defends against a stale account whose
    // GameDayParticipant row still exists.
    const participant = await prisma.gameDayParticipant.findFirst({
      where: {
        gameDayId: id,
        playerId: g.ctx.userId,
        player: { deletedAt: null },
      },
      select: { attendance: true },
    });
    const isOnRoster =
      participant?.attendance === "confirmed" || participant?.attendance === "joker";
    if (!isOnRoster) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const match = await addExtraMatch(id, g.ctx.userId);
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
