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

import {
  deletePlayer,
  PlayerNotFoundError as DeletePlayerNotFoundError,
  SelfDeleteError,
  LastAdminError as DeleteLastAdminError,
  ActiveParticipationError,
} from "@/lib/players/delete";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  try {
    await deletePlayer({ playerId: id, actorId: session.user.id });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof DeletePlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (e instanceof SelfDeleteError) {
      return NextResponse.json(
        { error: "self_delete", message: "Du kannst dich nicht selbst löschen" },
        { status: 409 },
      );
    }
    if (e instanceof DeleteLastAdminError) {
      return NextResponse.json(
        { error: "last_admin", message: "Der letzte verbleibende Admin kann nicht gelöscht werden" },
        { status: 409 },
      );
    }
    if (e instanceof ActiveParticipationError) {
      return NextResponse.json(
        { error: "active_participation", message: "Spieler ist für einen laufenden Spieltag eingeplant" },
        { status: 409 },
      );
    }
    throw e;
  }
}
