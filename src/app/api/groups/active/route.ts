import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMember } from "@/lib/auth/route-guard";
import { ForbiddenError } from "@/lib/auth/group-context";
import { isAdminRole } from "@/lib/auth/roles";
import { groupNameField } from "@/lib/invitations/schemas";
import { rateLimit } from "@/lib/rate-limit";
import { rateLimitedResponse } from "@/lib/rate-limit-response";
import { AppleReauthRequiredError, APPLE_REAUTH_MESSAGE, verifyReauthToken } from "@/lib/auth/apple/reauth";
import { renameGroup } from "@/lib/group/rename";
import { deleteGroup, NameMismatchError, WrongPasswordError } from "@/lib/group/delete";

const RenameBody = z.object({ groupId: z.string().uuid(), name: groupNameField });
const DeleteBody = z.object({
  groupId: z.string().uuid(),
  name: z.string(),
  password: z.string().min(1).optional(),
  identityToken: z.string().min(1).max(8000).optional(),
});

const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 });
const staleGroup = () => NextResponse.json({ error: "stale_group" }, { status: 409 });

export async function PATCH(req: Request) {
  const g = await guardMember();
  if (g.response) return g.response;
  const parsed = RenameBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (parsed.data.groupId !== g.ctx.groupId) return staleGroup();
  if (!isAdminRole(g.ctx.role)) return forbidden();
  try {
    const result = await renameGroup({
      groupId: g.ctx.groupId,
      actorId: g.ctx.userId,
      name: parsed.data.name,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ForbiddenError) return forbidden();
    throw e;
  }
}

export async function DELETE(req: Request) {
  const g = await guardMember();
  if (g.response) return g.response;
  const rl = rateLimit(`group-delete:${g.ctx.userId}`, { windowMs: 3_600_000, max: 5 });
  if (!rl.allowed) return rateLimitedResponse(rl);
  const parsed = DeleteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (parsed.data.groupId !== g.ctx.groupId) return staleGroup();
  if (g.ctx.role !== "owner") return forbidden();
  try {
    const appleProof = await verifyReauthToken(req, parsed.data.identityToken);
    await deleteGroup({
      groupId: g.ctx.groupId,
      actorId: g.ctx.userId,
      name: parsed.data.name,
      password: parsed.data.password,
      appleProof,
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof NameMismatchError) {
      return NextResponse.json({ error: "name_mismatch" }, { status: 400 });
    }
    if (e instanceof WrongPasswordError) {
      return NextResponse.json({ error: "wrong_password" }, { status: 403 });
    }
    if (e instanceof AppleReauthRequiredError) {
      return NextResponse.json({ error: "apple_reauth_required", message: APPLE_REAUTH_MESSAGE }, { status: 403 });
    }
    if (e instanceof ForbiddenError) return forbidden();
    throw e;
  }
}
