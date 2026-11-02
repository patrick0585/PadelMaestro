import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guardMember } from "@/lib/auth/route-guard";
import { findGroupGameDay } from "@/lib/game-day/group-scope";
import {
  recordJokerUse,
  cancelJokerUse,
  JokerLockedError,
  JokerCapExceededError,
  JokerNotFoundError,
} from "@/lib/joker/use";

const Schema = z.object({ gameDayId: z.string().uuid() });

export async function POST(req: Request) {
  const g = await guardMember();
  if (g.response) return g.response;

  const body = Schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  if (!(await findGroupGameDay(g.ctx.groupId, body.data.gameDayId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const jokerUse = await recordJokerUse({
      playerId: g.ctx.userId,
      gameDayId: body.data.gameDayId,
    });
    revalidatePath("/");
    return NextResponse.json({ jokerUse }, { status: 201 });
  } catch (err) {
    if (err instanceof JokerLockedError) {
      return NextResponse.json({ code: "JOKER_LOCKED" }, { status: 409 });
    }
    if (err instanceof JokerCapExceededError) {
      return NextResponse.json({ code: "JOKER_CAP_EXCEEDED" }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(req: Request) {
  const g = await guardMember();
  if (g.response) return g.response;

  const body = Schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  if (!(await findGroupGameDay(g.ctx.groupId, body.data.gameDayId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    await cancelJokerUse({
      playerId: g.ctx.userId,
      gameDayId: body.data.gameDayId,
    });
    revalidatePath("/");
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof JokerLockedError) {
      return NextResponse.json({ code: "JOKER_LOCKED" }, { status: 409 });
    }
    if (err instanceof JokerNotFoundError) {
      return NextResponse.json({ code: "JOKER_NOT_FOUND" }, { status: 409 });
    }
    throw err;
  }
}
