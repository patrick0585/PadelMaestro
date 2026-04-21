import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { recordJokerUse } from "@/lib/joker/use";

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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 409 },
    );
  }
}
