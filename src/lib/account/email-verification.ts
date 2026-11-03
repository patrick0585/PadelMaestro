import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isPlaceholderEmail, normaliseEmail } from "@/lib/auth/email";
import { generateToken, hashToken, tokenExpiry } from "@/lib/auth/token";
import { appUrl } from "@/lib/mail/app-url";
import { sendMail } from "@/lib/mail/send";
import { emailChangedMail, verifyEmailMail } from "@/lib/mail/templates";
import { EmailTakenError, InvalidTokenError, PlayerNotFoundError } from "./errors";
import { revokeOpenTokens } from "./tokens";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

async function loadPlayer(playerId: string) {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      name: true,
      email: true,
      pendingEmail: true,
      emailVerifiedAt: true,
      deletedAt: true,
    },
  });
  if (!player || player.deletedAt) throw new PlayerNotFoundError(playerId);
  return player;
}

// Mail goes out after the write, so a failed send leaves the token in place for a resend.
async function issueVerification(
  player: { id: string; name: string },
  email: string,
  pendingEmail: string | null,
): Promise<void> {
  const now = new Date();
  const { token, hash } = generateToken();
  await prisma.$transaction(async (tx) => {
    await revokeOpenTokens(tx, player.id, "verify_email", now);
    await tx.player.update({ where: { id: player.id }, data: { pendingEmail } });
    await tx.emailToken.create({
      data: {
        playerId: player.id,
        purpose: "verify_email",
        tokenHash: hash,
        email,
        expiresAt: tokenExpiry(VERIFY_TTL_MS, now),
      },
    });
  });
  const link = appUrl(`/email-bestaetigen/${token}`);
  await sendMail({ to: email, ...verifyEmailMail({ name: player.name, link }) });
}

export async function requestEmailChange(i: {
  playerId: string;
  newEmail: string;
}): Promise<void> {
  const player = await loadPlayer(i.playerId);
  const newEmail = normaliseEmail(i.newEmail);

  if (newEmail === player.email) {
    if (player.emailVerifiedAt) {
      // Back to the confirmed address: drop a pending change, nothing to send.
      if (player.pendingEmail) {
        await prisma.$transaction(async (tx) => {
          await revokeOpenTokens(tx, player.id, "verify_email");
          await tx.player.update({ where: { id: player.id }, data: { pendingEmail: null } });
        });
      }
      return;
    }
    return issueVerification(player, newEmail, null);
  }

  const owner = await prisma.player.findFirst({
    where: { email: newEmail, id: { not: player.id } },
    select: { id: true },
  });
  if (owner) throw new EmailTakenError(newEmail);

  return issueVerification(player, newEmail, newEmail);
}

export async function sendVerification(i: { playerId: string }): Promise<void> {
  const player = await loadPlayer(i.playerId);
  if (isPlaceholderEmail(player.pendingEmail ?? player.email)) return;
  if (player.pendingEmail) {
    return issueVerification(player, player.pendingEmail, player.pendingEmail);
  }
  if (player.emailVerifiedAt) return;
  return issueVerification(player, player.email, null);
}

export async function confirmEmailToken(
  token: string,
  now: Date = new Date(),
): Promise<{ playerId: string; email: string }> {
  let result: {
    playerId: string;
    email: string;
    name: string;
    from: string;
    wasVerified: boolean;
  } | null;
  let target = "";
  try {
    result = await prisma.$transaction(async (tx) => {
      const row = await tx.emailToken.findFirst({
        where: {
          tokenHash: hashToken(token),
          purpose: "verify_email",
          usedAt: null,
          expiresAt: { gt: now },
        },
        include: {
          player: {
            select: {
              name: true,
              email: true,
              pendingEmail: true,
              emailVerifiedAt: true,
              deletedAt: true,
            },
          },
        },
      });
      if (!row || row.player.deletedAt) throw new InvalidTokenError();
      // The address may have moved on since the mail went out (admin edit, newer request).
      if (row.email !== (row.player.pendingEmail ?? row.player.email)) {
        await tx.emailToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
        return null;
      }
      target = row.email;

      const owner = await tx.player.findFirst({
        where: { email: row.email, id: { not: row.playerId } },
        select: { id: true },
      });
      if (owner) throw new EmailTakenError(row.email);

      // Guards against a concurrent confirm of the same token.
      const claimed = await tx.emailToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new InvalidTokenError();

      const changed = row.email !== row.player.email;
      await tx.player.update({
        where: { id: row.playerId },
        data: {
          email: row.email,
          pendingEmail: null,
          emailVerifiedAt: now,
          ...(changed && { sessionVersion: { increment: 1 } }),
        },
      });
      if (changed) await revokeOpenTokens(tx, row.playerId, undefined, now);

      await tx.auditLog.create({
        data: {
          actorId: row.playerId,
          action: changed ? "player.email_change" : "player.email_verified",
          entityType: "Player",
          entityId: row.playerId,
          payload: changed ? { from: row.player.email, to: row.email } : { email: row.email },
        },
      });

      return {
        playerId: row.playerId,
        email: row.email,
        name: row.player.name,
        from: row.player.email,
        wasVerified: row.player.emailVerifiedAt !== null,
      };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new EmailTakenError(target);
    }
    throw e;
  }
  if (!result) throw new InvalidTokenError();

  if (result.wasVerified && result.from !== result.email) {
    try {
      await sendMail({
        to: result.from,
        ...emailChangedMail({ name: result.name, newEmail: result.email }),
      });
    } catch (e) {
      console.warn("[account] notifying old address failed", e);
    }
  }

  return { playerId: result.playerId, email: result.email };
}
