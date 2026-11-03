import { prisma } from "@/lib/db";
import { generateToken, tokenExpiry } from "@/lib/auth/token";
import {
  FOUNDER_MAX_USES,
  FOUNDER_TTL_MS,
  MEMBER_MAX_USES,
  MEMBER_TTL_MS,
} from "./constants";

export type CreateInvitationInput =
  | { kind: "member"; groupId: string; createdById: string; note?: string }
  | { kind: "founder"; note?: string };

export async function createInvitation(
  i: CreateInvitationInput,
  now: Date = new Date(),
): Promise<{ id: string; token: string; expiresAt: Date }> {
  const { token, hash } = generateToken();
  const member = i.kind === "member";
  const expiresAt = tokenExpiry(member ? MEMBER_TTL_MS : FOUNDER_TTL_MS, now);
  const maxUses = member ? MEMBER_MAX_USES : FOUNDER_MAX_USES;
  const note = i.note ?? null;

  const id = await prisma.$transaction(async (tx) => {
    const row = await tx.invitation.create({
      data: {
        kind: i.kind,
        groupId: member ? i.groupId : null,
        createdById: member ? i.createdById : null,
        tokenHash: hash,
        note,
        expiresAt,
        maxUses,
      },
      select: { id: true },
    });
    if (member) {
      await tx.auditLog.create({
        data: {
          actorId: i.createdById,
          groupId: i.groupId,
          action: "invitation.create",
          entityType: "Invitation",
          entityId: row.id,
          payload: { note, expiresAt: expiresAt.toISOString(), maxUses },
        },
      });
    }
    return row.id;
  });

  return { id, token, expiresAt };
}
