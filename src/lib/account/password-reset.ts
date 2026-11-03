import { prisma } from "@/lib/db";
import { normaliseEmail } from "@/lib/auth/email";
import { hashPassword } from "@/lib/auth/hash";
import { generateToken, hashToken, tokenExpiry } from "@/lib/auth/token";
import { appUrl } from "@/lib/mail/app-url";
import { sendMail } from "@/lib/mail/send";
import { passwordResetMail } from "@/lib/mail/templates";
import { InvalidTokenError } from "./errors";

const RESET_TTL_MS = 60 * 60 * 1000;

// Unknown, deleted or unverified addresses return silently so the response reveals nothing.
export async function requestPasswordReset(email: string): Promise<void> {
  const player = await prisma.player.findFirst({
    where: { email: normaliseEmail(email), deletedAt: null, emailVerifiedAt: { not: null } },
    select: { id: true, name: true, email: true },
  });
  if (!player) return;

  const now = new Date();
  const { token, hash } = generateToken();
  await prisma.$transaction(async (tx) => {
    await tx.emailToken.updateMany({
      where: { playerId: player.id, purpose: "password_reset", usedAt: null },
      data: { usedAt: now },
    });
    await tx.emailToken.create({
      data: {
        playerId: player.id,
        purpose: "password_reset",
        tokenHash: hash,
        email: player.email,
        expiresAt: tokenExpiry(RESET_TTL_MS, now),
      },
    });
  });
  const link = appUrl(`/passwort-zuruecksetzen/${token}`);
  await sendMail({ to: player.email, ...passwordResetMail({ name: player.name, link }) });
}

export async function confirmPasswordReset(i: {
  token: string;
  newPassword: string;
  now?: Date;
}): Promise<void> {
  const now = i.now ?? new Date();
  const passwordHash = await hashPassword(i.newPassword);
  await prisma.$transaction(async (tx) => {
    const row = await tx.emailToken.findFirst({
      where: {
        tokenHash: hashToken(i.token),
        purpose: "password_reset",
        usedAt: null,
        expiresAt: { gt: now },
      },
      include: { player: { select: { deletedAt: true } } },
    });
    if (!row || row.player.deletedAt) throw new InvalidTokenError();

    // Guards against a concurrent confirm of the same token.
    const claimed = await tx.emailToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new InvalidTokenError();

    await tx.player.update({ where: { id: row.playerId }, data: { passwordHash } });
    await tx.emailToken.updateMany({
      where: { playerId: row.playerId, purpose: "password_reset", usedAt: null },
      data: { usedAt: now },
    });
    await tx.auditLog.create({
      data: {
        actorId: row.playerId,
        action: "player.password_reset",
        entityType: "Player",
        entityId: row.playerId,
        payload: { playerId: row.playerId, via: "email" },
      },
    });
  });
}
