import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { lockRoster } from "@/lib/game-day/lock";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  try {
    const day = await lockRoster(id, session.user.id);
    return NextResponse.json({ gameDay: day });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
