import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { guardGroupAdmin } from "@/lib/auth/route-guard";
import { findGroupGameDay } from "@/lib/game-day/group-scope";
import { findGroupMembership } from "@/lib/group/active-membership";
import { prisma } from "@/lib/db";
import {
  recordJokerUseAsAdmin,
  cancelJokerUseAsAdmin,
  JokerLockedError,
  JokerCapExceededError,
  JokerNotFoundError,
} from "@/lib/joker/use";

type Params = { params: Promise<{ id: string; playerId: string }> };

export async function POST(_req: Request, ctx: Params) {
  const g = await guardGroupAdmin();
  if (g.response) return g.response;
  const { id, playerId } = await ctx.params;
  if (!(await findGroupGameDay(g.ctx.groupId, id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!(await findGroupMembership(prisma, g.ctx.groupId, playerId))) {
    return NextResponse.json({ error: "player_not_found" }, { status: 404 });
  }

  try {
    await recordJokerUseAsAdmin({
      actorId: g.ctx.userId,
      playerId,
      gameDayId: id,
    });
    revalidatePath("/");
    revalidatePath("/admin");
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
  const g = await guardGroupAdmin();
  if (g.response) return g.response;
  const { id, playerId } = await ctx.params;
  if (!(await findGroupGameDay(g.ctx.groupId, id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!(await findGroupMembership(prisma, g.ctx.groupId, playerId))) {
    return NextResponse.json({ error: "player_not_found" }, { status: 404 });
  }

  try {
    await cancelJokerUseAsAdmin({
      actorId: g.ctx.userId,
      playerId,
      gameDayId: id,
    });
    revalidatePath("/");
    revalidatePath("/admin");
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
