import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  recordJokerUse,
  cancelJokerUse,
  JokerLockedError,
  JokerCapExceededError,
  JokerNotFoundError,
} from "@/lib/joker/use";

const Schema = z.object({ gameDayId: z.string().uuid() });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = Schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const jokerUse = await recordJokerUse({
      playerId: session.user.id,
      gameDayId: body.data.gameDayId,
    });
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
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = Schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    await cancelJokerUse({
      playerId: session.user.id,
      gameDayId: body.data.gameDayId,
    });
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
