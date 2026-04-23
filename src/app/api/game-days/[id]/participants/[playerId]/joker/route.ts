import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  recordJokerUseAsAdmin,
  cancelJokerUseAsAdmin,
  JokerLockedError,
  JokerCapExceededError,
  JokerNotFoundError,
} from "@/lib/joker/use";

type Params = { params: Promise<{ id: string; playerId: string }> };

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }), session: null };
  }
  if (!session.user.isAdmin) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }), session: null };
  }
  return { error: null, session };
}

export async function POST(_req: Request, ctx: Params) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { id, playerId } = await ctx.params;

  try {
    await recordJokerUseAsAdmin({
      actorId: gate.session!.user!.id,
      playerId,
      gameDayId: id,
    });
    revalidatePath("/");
    return new NextResponse(null, { status: 201 });
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

export async function DELETE(_req: Request, ctx: Params) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { id, playerId } = await ctx.params;

  try {
    await cancelJokerUseAsAdmin({
      actorId: gate.session!.user!.id,
      playerId,
      gameDayId: id,
    });
    revalidatePath("/");
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
