import { NextResponse } from "next/server";
import { guardGroupAdmin } from "@/lib/auth/route-guard";
import { createInvitation } from "@/lib/invitations/create";
import { listOpenInvitations } from "@/lib/invitations/manage";
import { createInvitationSchema } from "@/lib/invitations/schemas";
import { appUrl } from "@/lib/mail/app-url";

export async function GET() {
  const g = await guardGroupAdmin();
  if (g.response) return g.response;
  const list = await listOpenInvitations(g.ctx.groupId);
  return NextResponse.json(
    list.map((i) => ({
      ...i,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
      uses: i.uses.map((u) => ({ ...u, usedAt: u.usedAt.toISOString() })),
    })),
  );
}

export async function POST(req: Request) {
  const g = await guardGroupAdmin();
  if (g.response) return g.response;
  const body = await req.json().catch(() => ({}));
  const parsed = createInvitationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const inv = await createInvitation({
    kind: "member",
    groupId: g.ctx.groupId,
    createdById: g.ctx.userId,
    note: parsed.data.note,
  });
  return NextResponse.json(
    {
      id: inv.id,
      url: appUrl(`/einladung/${inv.token}`),
      expiresAt: inv.expiresAt.toISOString(),
    },
    { status: 201 },
  );
}
