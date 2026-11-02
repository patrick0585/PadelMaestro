import { NextResponse } from "next/server";
import { z } from "zod";
import { guardGroupAdmin } from "@/lib/auth/route-guard";
import {
  closeSeasonAndStartNext,
  InvalidSeasonNamesError,
  NoActiveSeasonError,
  OpenGameDaysError,
  SeasonNameConflictError,
} from "@/lib/season";

const CloseSchema = z.object({
  closedName: z.string().max(40),
  nextName: z.string().max(40),
});

export async function POST(req: Request) {
  const g = await guardGroupAdmin();
  if (g.response) return g.response;

  const parsed = CloseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const result = await closeSeasonAndStartNext({
      groupId: g.ctx.groupId,
      closedName: parsed.data.closedName,
      nextName: parsed.data.nextName,
      actorId: g.ctx.userId,
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
