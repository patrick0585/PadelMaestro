import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createGameDay, GameDayDateExistsError } from "@/lib/game-day/create";

const CreateSchema = z.object({ date: z.string() });

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const days = await prisma.gameDay.findMany({
    orderBy: { date: "desc" },
    include: {
      participants: { include: { player: { select: { id: true, name: true } } } },
    },
  });
  return NextResponse.json({ gameDays: days });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const day = await createGameDay(new Date(parsed.data.date), session.user.id);
    return NextResponse.json({ gameDay: day }, { status: 201 });
  } catch (e) {
    if (e instanceof GameDayDateExistsError) {
      return NextResponse.json({ error: "date_exists" }, { status: 409 });
    }
    throw e;
  }
}
