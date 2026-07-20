import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  closeSeasonAndStartNext,
  InvalidSeasonNamesError,
  NoActiveSeasonError,
  OpenGameDaysError,
  SeasonNameConflictError,
} from "@/lib/season";

const CloseSchema = z.object({ closedName: z.string(), nextName: z.string() });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = CloseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const result = await closeSeasonAndStartNext({
      closedName: parsed.data.closedName,
      nextName: parsed.data.nextName,
      actorId: session.user.id,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof InvalidSeasonNamesError)
      return NextResponse.json({ error: "invalid_names" }, { status: 400 });
    if (e instanceof SeasonNameConflictError)
      return NextResponse.json({ error: "name_conflict" }, { status: 409 });
    if (e instanceof NoActiveSeasonError)
      return NextResponse.json({ error: "no_active_season" }, { status: 409 });
    if (e instanceof OpenGameDaysError)
      return NextResponse.json(
        {
          error: "open_game_days",
          days: e.days.map((d) => d.date.toISOString().slice(0, 10)),
        },
        { status: 409 },
      );
    throw e;
  }
}
