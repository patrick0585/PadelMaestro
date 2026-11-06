import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { publicSignupEnabled } from "@/lib/flags";
import { AppleAuthError } from "@/lib/auth/apple/errors";
import type { AppleIdentity } from "@/lib/auth/apple/verify";
import { InvitationInvalidError } from "@/lib/invitations/errors";
import { findRedeemableInvitation } from "@/lib/invitations/lookup";
import { redeemForNewPlayer } from "@/lib/invitations/redeem";

const NAME_MAX = 60;
const PLACEHOLDER_NAME = "Neuer Spieler";

export interface AppleResolution {
  playerId: string;
  created: boolean;
  /** No refresh token stored yet, so the caller should exchange the authorization code. */
  needsRefreshToken: boolean;
}

function cleanName(given?: string | null, family?: string | null): string | null {
  const full = [given, family]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, NAME_MAX)
    .trim();
  return full || null;
}

function accountEmail(identity: AppleIdentity): string {
  if (identity.email) return identity.email;
  const digest = createHash("sha256").update(identity.sub).digest("hex").slice(0, 20);
  return `apple-${digest}@anonym.invalid`;
}

const resolutionSelect = { id: true, appleRefreshToken: true } as const;

async function bySub(sub: string) {
  return prisma.player.findFirst({ where: { appleSub: sub, deletedAt: null }, select: resolutionSelect });
}

export async function resolveAppleAccount(i: {
  identity: AppleIdentity;
  givenName?: string | null;
  familyName?: string | null;
  invitationToken?: string | null;
  now?: Date;
}): Promise<AppleResolution> {
  const { identity } = i;
  const now = i.now ?? new Date();

  const known = await bySub(identity.sub);
  if (known) return { playerId: known.id, created: false, needsRefreshToken: !known.appleRefreshToken };

  if (identity.email && identity.emailVerified) {
    const sameEmail = await prisma.player.findFirst({
      where: { email: identity.email, deletedAt: null },
      select: { id: true, emailVerifiedAt: true, appleSub: true },
    });
    if (sameEmail) {
      if (!sameEmail.emailVerifiedAt) throw new AppleAuthError("apple_email_unverified_account");
      if (sameEmail.appleSub) throw new AppleAuthError("apple_already_linked");
      await prisma.$transaction(async (tx) => {
        await tx.player.update({ where: { id: sameEmail.id }, data: { appleSub: identity.sub } });
        await tx.auditLog.create({
          data: {
            actorId: sameEmail.id,
            action: "player.apple_link",
            entityType: "Player",
            entityId: sameEmail.id,
            payload: { via: "email" },
          },
        });
      });
      return { playerId: sameEmail.id, created: false, needsRefreshToken: true };
    }
  }

  const token = i.invitationToken?.trim() || null;
  if (token) {
    try {
      await findRedeemableInvitation(prisma, token, now);
    } catch (e) {
      if (e instanceof InvitationInvalidError) throw new AppleAuthError("invitation_invalid");
      throw e;
    }
  } else if (!publicSignupEnabled()) {
    throw new AppleAuthError("signup_closed");
  }

  const name = cleanName(i.givenName, i.familyName);
  try {
    const playerId = await prisma.$transaction(async (tx) => {
      const player = await tx.player.create({
        data: {
          name: name ?? PLACEHOLDER_NAME,
          needsName: name === null,
          email: accountEmail(identity),
          passwordHash: null,
          appleSub: identity.sub,
          emailVerifiedAt: now,
          termsAcceptedAt: now,
        },
        select: { id: true },
      });
      if (token) {
        await redeemForNewPlayer(tx, token, player.id, now, "apple");
      } else {
        await tx.auditLog.create({
          data: {
            actorId: player.id,
            groupId: null,
            action: "player.signup",
            entityType: "Player",
            entityId: player.id,
            payload: { kind: "apple" },
          },
        });
      }
      return player.id;
    });
    return { playerId, created: true, needsRefreshToken: true };
  } catch (e) {
    if (e instanceof InvitationInvalidError) throw new AppleAuthError("invitation_invalid");
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target ?? []) as string[];
      if (target.includes("appleSub")) {
        const raced = await bySub(identity.sub);
        if (raced) return { playerId: raced.id, created: false, needsRefreshToken: !raced.appleRefreshToken };
      }
      if (target.includes("email")) throw new AppleAuthError("apple_email_unverified_account");
    }
    throw e;
  }
}

export async function storeAppleRefreshToken(
  playerId: string,
  refreshToken: string,
  clientId: string,
): Promise<void> {
  await prisma.player.update({
    where: { id: playerId },
    data: { appleRefreshToken: refreshToken, appleClientId: clientId },
  });
}

/** Attaches an Apple ID to the signed-in account; refuses when it belongs to someone else. */
export async function linkAppleToPlayer(i: { playerId: string; identity: AppleIdentity }): Promise<void> {
  const owner = await prisma.player.findFirst({
    where: { appleSub: i.identity.sub },
    select: { id: true },
  });
  if (owner && owner.id !== i.playerId) throw new AppleAuthError("apple_already_linked");
  if (owner) return;
  const me = await prisma.player.findUnique({
    where: { id: i.playerId },
    select: { appleSub: true, deletedAt: true },
  });
  if (!me || me.deletedAt || me.appleSub) throw new AppleAuthError("apple_already_linked");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.player.update({ where: { id: i.playerId }, data: { appleSub: i.identity.sub } });
      await tx.auditLog.create({
        data: {
          actorId: i.playerId,
          action: "player.apple_link",
          entityType: "Player",
          entityId: i.playerId,
          payload: { via: "profile" },
        },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppleAuthError("apple_already_linked");
    }
    throw e;
  }
}

export async function setOwnName(playerId: string, name: string): Promise<void> {
  await prisma.player.update({ where: { id: playerId }, data: { name: name.trim(), needsName: false } });
}

export async function needsName(playerId: string): Promise<boolean> {
  const p = await prisma.player.findUnique({ where: { id: playerId }, select: { needsName: true } });
  return p?.needsName ?? false;
}
