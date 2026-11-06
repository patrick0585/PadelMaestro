import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { rateLimit } from "@/lib/rate-limit";
import { rateLimitedResponse } from "@/lib/rate-limit-response";
import {
  AnonymisationCollisionError,
  OwnerOfGroupError,
  deleteOwnAccount,
} from "@/lib/account/delete";
import { WrongPasswordError } from "@/lib/account/errors";
import { PlayerNotFoundError } from "@/lib/players/errors";

const Schema = z.object({ password: z.string().min(1).optional() });

export async function DELETE(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`profile-delete:${userId}`, { windowMs: 60 * 60_000, max: 5 });
  if (!rl.allowed) return rateLimitedResponse(rl);

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    await deleteOwnAccount({ playerId: userId, password: parsed.data.password });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof WrongPasswordError) {
      return NextResponse.json({ error: "wrong_password" }, { status: 403 });
    }
    if (e instanceof OwnerOfGroupError) {
      return NextResponse.json({ error: "owner_of_group", groups: e.groups }, { status: 409 });
    }
    if (e instanceof AnonymisationCollisionError) {
      return NextResponse.json({ error: "anonymisation_collision" }, { status: 409 });
    }
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
}
