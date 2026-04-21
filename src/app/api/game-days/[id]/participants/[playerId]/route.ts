import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  setAttendanceAsAdmin,
  GameDayNotFoundError,
  ParticipantNotFoundError,
  GameDayLockedError,
} from "@/lib/game-day/attendance";

const Schema = z.object({ status: z.enum(["confirmed", "declined", "pending"]) });

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; playerId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id, playerId } = await ctx.params;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const updated = await setAttendanceAsAdmin(
      id,
      playerId,
      parsed.data.status,
      session.user.id,
    );
    return NextResponse.json({ participant: updated });
  } catch (e) {
    if (e instanceof GameDayNotFoundError) {
      return NextResponse.json({ error: "game_day_not_found" }, { status: 404 });
    }
    if (e instanceof ParticipantNotFoundError) {
      return NextResponse.json({ error: "participant_not_found" }, { status: 404 });
    }
    if (e instanceof GameDayLockedError) {
      return NextResponse.json({ error: "locked" }, { status: 409 });
    }
    throw e;
  }
}
