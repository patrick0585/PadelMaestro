import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { generateInvitationToken, invitationExpiryFromNow } from "@/lib/auth/token";

// Permissive email check (contains "@" with non-empty local/domain parts);
// full RFC validation is delegated to the email-delivery layer.
const InviteSchema = z.object({
  email: z.string().min(3).regex(/^[^@\s]+@[^@\s]+$/, "Invalid email"),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = InviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const token = generateInvitationToken();
  const invite = await prisma.invitation.create({
    data: {
      email: parsed.data.email,
      token,
      invitedById: session.user.id,
      expiresAt: invitationExpiryFromNow(),
    },
  });

  const base = process.env.AUTH_URL ?? "http://localhost:3000";
  return NextResponse.json(
    { token: invite.token, url: `${base}/invite/${invite.token}` },
    { status: 201 },
  );
}
