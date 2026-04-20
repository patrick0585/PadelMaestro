import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { setAttendance } from "@/lib/game-day/attendance";

const Schema = z.object({ status: z.enum(["confirmed", "declined", "pending"]) });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const updated = await setAttendance(id, session.user.id, parsed.data.status);
    return NextResponse.json({ participant: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
