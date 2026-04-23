import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  changeOwnPassword,
  WrongCurrentPasswordError,
  PlayerNotFoundError,
} from "@/lib/players/change-password";

const Schema = z.object({
  // Cap at 72 bytes — bcrypt silently truncates longer inputs, which would let
  // an attacker who knows the first 72 bytes authenticate with any suffix.
  currentPassword: z.string().min(1).max(72),
  newPassword: z.string().min(8).max(72),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    await changeOwnPassword({
      playerId: session.user.id,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof WrongCurrentPasswordError) {
      return NextResponse.json({ error: "wrong_password" }, { status: 401 });
    }
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
}
