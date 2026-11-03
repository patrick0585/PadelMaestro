import type { InvitationKind, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/auth/token";
import { InvitationInvalidError, type InvitationInvalidReason } from "./errors";

export type RedeemableInvitation = {
  id: string;
  kind: InvitationKind;
  groupId: string | null;
  maxUses: number;
  usedCount: number;
};

export async function findRedeemableInvitation(
  db: Prisma.TransactionClient | PrismaClient,
  token: string,
  now: Date = new Date(),
): Promise<RedeemableInvitation> {
  const row = await db.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      kind: true,
      groupId: true,
      maxUses: true,
      usedCount: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
  if (!row) throw new InvitationInvalidError("unknown");
  if (row.revokedAt) throw new InvitationInvalidError("revoked");
  if (row.expiresAt <= now) throw new InvitationInvalidError("expired");
  if (row.usedCount >= row.maxUses) throw new InvitationInvalidError("exhausted");
  const { id, kind, groupId, maxUses, usedCount } = row;
  return { id, kind, groupId, maxUses, usedCount };
}

export type InvitationPreview =
  | { ok: true; kind: InvitationKind; groupId: string | null; groupName: string | null }
  | { ok: false; reason: InvitationInvalidReason };

export async function previewInvitation(
  token: string,
  now: Date = new Date(),
): Promise<InvitationPreview> {
  try {
    const inv = await findRedeemableInvitation(prisma, token, now);
    const group = inv.groupId
      ? await prisma.group.findUnique({ where: { id: inv.groupId }, select: { name: true } })
      : null;
    return { ok: true, kind: inv.kind, groupId: inv.groupId, groupName: group?.name ?? null };
  } catch (e) {
    if (e instanceof InvitationInvalidError) return { ok: false, reason: e.reason };
    throw e;
  }
}
