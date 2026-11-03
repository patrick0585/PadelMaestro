import { NextResponse } from "next/server";
import { z } from "zod";
import { guardGroupAdmin } from "@/lib/auth/route-guard";
import { isAdminRole } from "@/lib/auth/roles";
import { listActiveMembers } from "@/lib/group/members";
import {
  createPlayer,
  DuplicateEmailError,
  DuplicateUsernameError,
} from "@/lib/players/create";
import { normaliseUsername, isValidUsername } from "@/lib/auth/username";
import { isPlaceholderEmail } from "@/lib/auth/email";

const CreateSchema = z.object({
  email: z.string().email().refine((e) => !isPlaceholderEmail(e)),
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
  const g = await guardGroupAdmin();
  if (g.response) return g.response;
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
      actorId: g.ctx.userId,
      groupId: g.ctx.groupId,
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
  const g = await guardGroupAdmin();
  if (g.response) return g.response;
  const members = await listActiveMembers(g.ctx.groupId);
  return NextResponse.json(
    members.map(({ avatarVersion: _avatarVersion, ...m }) => ({
      ...m,
      isAdmin: isAdminRole(m.role),
    })),
  );
}
