import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  createPlayer,
  DuplicateEmailError,
  DuplicateUsernameError,
} from "@/lib/players/create";
import { normaliseUsername, isValidUsername } from "@/lib/auth/username";

const CreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  isAdmin: z.boolean().optional(),
  username: z
    .string()
    .transform(normaliseUsername)
    .refine(isValidUsername, { message: "invalid username" })
    .optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const player = await createPlayer({
      email: parsed.data.email,
      name: parsed.data.name,
      password: parsed.data.password,
      isAdmin: parsed.data.isAdmin ?? false,
      username: parsed.data.username,
      actorId: session.user.id,
    });
    return NextResponse.json(player, { status: 201 });
  } catch (e) {
    if (e instanceof DuplicateEmailError) {
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }
    if (e instanceof DuplicateUsernameError) {
      return NextResponse.json({ error: "username_taken" }, { status: 409 });
    }
    throw e;
  }
}

export async function GET(_req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const players = await prisma.player.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      isAdmin: true,
      passwordHash: true,
    },
  });
  return NextResponse.json(
    players.map((p) => ({
      id: p.id,
      email: p.email,
      username: p.username,
      name: p.name,
      isAdmin: p.isAdmin,
      hasPassword: p.passwordHash !== null,
    })),
  );
}
