import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  enterScore,
  ScoreConflictError,
  GameDayFinishedError,
  NotAllowedError,
  InvalidScoreError,
} from "@/lib/match/enter-score";

const Schema = z.object({
  team1Score: z.number().int().min(0),
  team2Score: z.number().int().min(0),
  expectedVersion: z.number().int().min(0),
});

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  const body = Schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const match = await enterScore({
      matchId: id,
      team1Score: body.data.team1Score,
      team2Score: body.data.team2Score,
      scoredBy: session.user.id,
      expectedVersion: body.data.expectedVersion,
      isAdmin: session.user.isAdmin ?? false,
    });
    return NextResponse.json({ match });
  } catch (err) {
    if (err instanceof NotAllowedError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (err instanceof ScoreConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof GameDayFinishedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof InvalidScoreError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
