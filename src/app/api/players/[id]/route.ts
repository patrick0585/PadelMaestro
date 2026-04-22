import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  updatePlayer,
  PlayerNotFoundError,
  DuplicateEmailError,
  DuplicateUsernameError,
  LastAdminError,
} from "@/lib/players/update";
import { normaliseUsername, isValidUsername } from "@/lib/auth/username";

const PatchSchema = z
  .object({
    username: z
      .string()
      .transform(normaliseUsername)
      .refine(isValidUsername, { message: "invalid username" })
      .optional(),
    name: z.string().min(1).max(64).optional(),
    email: z.string().email().optional(),
    isAdmin: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "no_fields" });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    if (flat.formErrors.includes("no_fields")) {
      return NextResponse.json({ error: "no_fields" }, { status: 400 });
    }
    return NextResponse.json({ error: "invalid", details: flat }, { status: 400 });
  }
  try {
    const updated = await updatePlayer({
      playerId: id,
      actorId: session.user.id,
      fields: parsed.data,
    });
    return NextResponse.json(updated, { status: 200 });
  } catch (e) {
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (e instanceof DuplicateUsernameError) {
      return NextResponse.json({ error: "username_taken" }, { status: 409 });
    }
    if (e instanceof DuplicateEmailError) {
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }
    if (e instanceof LastAdminError) {
      return NextResponse.json({ error: "last_admin" }, { status: 409 });
    }
    throw e;
  }
}
