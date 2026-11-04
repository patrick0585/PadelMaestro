import { NextResponse } from "next/server";
import { z } from "zod";
import { guardGroupAdmin, guardMember } from "@/lib/auth/route-guard";
import { prisma } from "@/lib/db";
import { notifyNewGameDay } from "@/lib/push/notify-game-day";
import { createGameDay, GameDayDateExistsError } from "@/lib/game-day/create";

const CreateSchema = z.object({ date: z.string() });

export async function GET() {
  const g = await guardMember();
  if (g.response) return g.response;

  const days = await prisma.gameDay.findMany({
    where: { groupId: g.ctx.groupId },
    orderBy: { date: "desc" },
    include: {
      participants: { include: { player: { select: { id: true, name: true } } } },
    },
  });
  return NextResponse.json({ gameDays: days });
}

export async function POST(req: Request) {
  const g = await guardGroupAdmin();
  if (g.response) return g.response;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const day = await createGameDay(g.ctx.groupId, new Date(parsed.data.date), g.ctx.userId);
    void notifyNewGameDay(day.id, g.ctx.userId);
    return NextResponse.json({ gameDay: day }, { status: 201 });
  } catch (e) {
    if (e instanceof GameDayDateExistsError) {
      return NextResponse.json({ error: "date_exists" }, { status: 409 });
    }
    throw e;
  }
}
