import { NextResponse } from "next/server";
import { z } from "zod";
import { guardGroupAdmin } from "@/lib/auth/route-guard";
import { findGroupGameDay } from "@/lib/game-day/group-scope";
import { findGroupMembership } from "@/lib/group/active-membership";
import { prisma } from "@/lib/db";
import {
  setAttendanceAsAdmin,
  GameDayNotFoundError,
  PlayerNotFoundError,
  GameDayLockedError,
} from "@/lib/game-day/attendance";

const Schema = z.object({ status: z.enum(["confirmed", "declined", "pending"]) });

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; playerId: string }> },
) {
  const g = await guardGroupAdmin();
  if (g.response) return g.response;

  const { id, playerId } = await ctx.params;
  if (!(await findGroupGameDay(g.ctx.groupId, id))) {
    return NextResponse.json({ error: "game_day_not_found" }, { status: 404 });
  }
  if (!(await findGroupMembership(prisma, g.ctx.groupId, playerId))) {
    return NextResponse.json({ error: "player_not_found" }, { status: 404 });
  }
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const updated = await setAttendanceAsAdmin(
      id,
      playerId,
      parsed.data.status,
      g.ctx.userId,
    );
    return NextResponse.json({ participant: updated });
  } catch (e) {
    if (e instanceof GameDayNotFoundError) {
      return NextResponse.json({ error: "game_day_not_found" }, { status: 404 });
    }
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "player_not_found" }, { status: 404 });
    }
    if (e instanceof GameDayLockedError) {
      return NextResponse.json({ error: "locked" }, { status: 409 });
    }
    throw e;
  }
}
