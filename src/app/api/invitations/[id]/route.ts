import { NextResponse } from "next/server";
import { guardGroupAdmin } from "@/lib/auth/route-guard";
import { InvitationNotFoundError } from "@/lib/invitations/errors";
import { revokeInvitation } from "@/lib/invitations/manage";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardGroupAdmin();
  if (g.response) return g.response;
  const { id } = await params;
  try {
    await revokeInvitation({ id, groupId: g.ctx.groupId, actorId: g.ctx.userId });
  } catch (e) {
    if (e instanceof InvitationNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
  return new NextResponse(null, { status: 204 });
}
