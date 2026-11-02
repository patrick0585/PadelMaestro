import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMember } from "@/lib/auth/route-guard";
import { findGroupGameDay } from "@/lib/game-day/group-scope";
import {
  setAttendance,
  GameDayNotFoundError,
  GameDayLockedError,
  NotParticipantError,
} from "@/lib/game-day/attendance";

const Schema = z.object({ status: z.enum(["confirmed", "declined", "pending"]) });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const g = await guardMember();
  if (g.response) return g.response;

  const { id } = await ctx.params;
  if (!(await findGroupGameDay(g.ctx.groupId, id))) {
    return NextResponse.json({ code: "ATTENDANCE_GAME_DAY_NOT_FOUND" }, { status: 404 });
  }

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  try {
    const updated = await setAttendance(id, g.ctx.userId, parsed.data.status);
    return NextResponse.json({ participant: updated });
  } catch (err) {
    if (err instanceof GameDayNotFoundError) {
      return NextResponse.json({ code: "ATTENDANCE_GAME_DAY_NOT_FOUND" }, { status: 404 });
    }
    if (err instanceof GameDayLockedError) {
      return NextResponse.json({ code: "ATTENDANCE_LOCKED" }, { status: 409 });
    }
    if (err instanceof NotParticipantError) {
      return NextResponse.json({ code: "ATTENDANCE_NOT_PARTICIPANT" }, { status: 403 });
    }
    throw err;
  }
}
