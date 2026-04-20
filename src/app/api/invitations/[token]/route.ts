import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/hash";
import { isTokenExpired } from "@/lib/auth/token";

const RedeemSchema = z.object({
  name: z.string().min(1).max(100),
  password: z.string().min(10).max(200),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const body = RedeemSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const invite = await prisma.invitation.findUnique({ where: { token } });
  if (!invite) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  if (invite.usedAt) return NextResponse.json({ error: "Already used" }, { status: 410 });
  if (isTokenExpired(invite.expiresAt)) {
    return NextResponse.json({ error: "Expired" }, { status: 410 });
  }

  const passwordHash = await hashPassword(body.data.password);

  const player = await prisma.$transaction(async (tx) => {
    const p = await tx.player.create({
      data: {
        name: body.data.name,
        email: invite.email,
        passwordHash,
        isAdmin: false,
      },
    });
    await tx.invitation.update({
      where: { token },
      data: { usedAt: new Date() },
    });
    return p;
  });

  return NextResponse.json({ id: player.id, email: player.email }, { status: 201 });
}
