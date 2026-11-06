import { Prisma, type InvitationKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/auth/token";
import { createSignedUpPlayer } from "@/lib/account/signup";
import { joinGroup } from "@/lib/group/join";
import { findGroupMembership } from "@/lib/group/active-membership";
import { InvitationInvalidError } from "./errors";
import { findRedeemableInvitation } from "./lookup";

async function consumeUse(
  tx: Prisma.TransactionClient,
  invitationId: string,
  playerId: string,
  now: Date,
): Promise<void> {
  // Same account re-using the same link (e.g. after removal): one use per account.
  const known = await tx.invitationUse.findUnique({
    where: { invitationId_playerId: { invitationId, playerId } },
    select: { id: true },
  });
  if (known) return;
  await tx.invitationUse.create({ data: { invitationId, playerId, usedAt: now } });
  // Atomic guard: a concurrent redeemer may have taken the last use.
  const claimed = await tx.invitation.updateMany({
    where: { id: invitationId, revokedAt: null, usedCount: { lt: prisma.invitation.fields.maxUses } },
    data: { usedCount: { increment: 1 } },
  });
  if (claimed.count !== 1) throw new InvitationInvalidError("exhausted");
}

/** Joins the group (or marks the founder link used) for a just-created player and audits the signup. */
export async function redeemForNewPlayer(
  tx: Prisma.TransactionClient,
  token: string,
  playerId: string,
  now: Date,
  via?: string,
): Promise<{ kind: InvitationKind; groupId: string | null }> {
  const inv = await findRedeemableInvitation(tx, token, now);
  if (inv.kind === "member" && inv.groupId) {
    await joinGroup(tx, { groupId: inv.groupId, playerId, now });
  }
  await consumeUse(tx, inv.id, playerId, now);
  await tx.auditLog.create({
    data: {
      actorId: playerId,
      groupId: inv.kind === "member" ? inv.groupId : null,
      action: "player.signup",
      entityType: "Player",
      entityId: playerId,
      payload: { invitationId: inv.id, kind: inv.kind, ...(via ? { via } : {}) },
    },
  });
  return { kind: inv.kind, groupId: inv.groupId };
}

export async function signupWithInvitation(i: {
  token: string;
  name: string;
  email: string;
  password: string;
  now?: Date;
}): Promise<{ playerId: string; kind: InvitationKind; groupId: string | null }> {
  const now = i.now ?? new Date();
  // Check the link before touching accounts, so a bad link never reveals whether an e-mail is taken.
  await findRedeemableInvitation(prisma, i.token, now);
  const { playerId, result } = await createSignedUpPlayer({ ...i, now }, (tx, id) =>
    redeemForNewPlayer(tx, i.token, id, now),
  );
  return { playerId, ...result };
}

export type JoinResult =
  | { kind: "member"; groupId: string; outcome: "joined" | "reactivated" | "already_member" }
  | { kind: "founder"; outcome: "redeemed" | "already_redeemed" };

export async function joinWithInvitation(i: {
  token: string;
  playerId: string;
  now?: Date;
}): Promise<JoinResult> {
  const now = i.now ?? new Date();
  try {
    return await joinInTransaction(i.token, i.playerId, now);
  } catch (e) {
    // A concurrent request of the same account won the race (double submit).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target ?? []) as string[];
      const settled = target.includes("playerId") ? await settledJoin(i.token, i.playerId) : null;
      if (settled) return settled;
    }
    throw e;
  }
}

async function settledJoin(token: string, playerId: string): Promise<JoinResult | null> {
  const inv = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, kind: true, groupId: true },
  });
  if (!inv) return null;
  if (inv.kind === "founder") {
    const use = await prisma.invitationUse.findUnique({
      where: { invitationId_playerId: { invitationId: inv.id, playerId } },
      select: { id: true },
    });
    return use ? { kind: "founder", outcome: "already_redeemed" } : null;
  }
  if (!inv.groupId) return null;
  const membership = await findGroupMembership(prisma, inv.groupId, playerId);
  return membership ? { kind: "member", groupId: inv.groupId, outcome: "already_member" } : null;
}

async function joinInTransaction(token: string, playerId: string, now: Date): Promise<JoinResult> {
  return prisma.$transaction(async (tx) => {
    // A founder link this account already used stays idempotent even once exhausted.
    const prior = await tx.invitationUse.findFirst({
      where: {
        playerId,
        invitation: { tokenHash: hashToken(token), kind: "founder" },
      },
      select: { id: true },
    });
    if (prior) return { kind: "founder", outcome: "already_redeemed" };

    const inv = await findRedeemableInvitation(tx, token, now);
    if (inv.kind === "founder") {
      await consumeUse(tx, inv.id, playerId, now);
      await tx.auditLog.create({
        data: {
          actorId: playerId,
          groupId: null,
          action: "invitation.redeem_founder",
          entityType: "Invitation",
          entityId: inv.id,
          payload: { invitationId: inv.id },
        },
      });
      return { kind: "founder", outcome: "redeemed" };
    }
    if (!inv.groupId) throw new InvitationInvalidError("unknown");

    const { outcome } = await joinGroup(tx, { groupId: inv.groupId, playerId, now });
    if (outcome !== "already_member") {
      await consumeUse(tx, inv.id, playerId, now);
      await tx.auditLog.create({
        data: {
          actorId: playerId,
          groupId: inv.groupId,
          action: "membership.join",
          entityType: "Group",
          entityId: inv.groupId,
          payload: { invitationId: inv.id, outcome },
        },
      });
    }
    return { kind: "member", groupId: inv.groupId, outcome };
  });
}
