import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { undoScore } from "@/lib/match/undo";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const match = await undoScore({ matchId: id, actorId: session.user.id });
    return NextResponse.json({ match });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 409 },
    );
  }
}
