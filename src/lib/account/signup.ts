import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/hash";
import { normaliseEmail } from "@/lib/auth/email";
import { sendVerification } from "@/lib/account/email-verification";
import { EmailTakenError } from "@/lib/account/errors";

// An address nobody confirmed within a day, on an account without any trace, may be used for a
// new signup; the old account is retired like a deleted one, so a stranger cannot block an address.
const STALE_UNVERIFIED_MS = 24 * 3600_000;

export interface SignupInput {
  name: string;
  email: string;
  password: string;
}

/**
 * Runs `inTx` with a fresh, unverified player and sends the verification mail afterwards.
 * Shared by the invitation signup and the open signup; maps duplicate e-mails to EmailTakenError.
 */
export async function createSignedUpPlayer<T>(
  i: SignupInput & { now: Date },
  inTx: (tx: Prisma.TransactionClient, playerId: string) => Promise<T>,
): Promise<{ playerId: string; result: T }> {
  const email = normaliseEmail(i.email);
  const passwordHash = await hashPassword(i.password);
  let out: { playerId: string; result: T };
  try {
    out = await prisma.$transaction(async (tx) => {
      const existing = await tx.player.findFirst({ where: { email }, select: { id: true } });
      if (existing) {
        // Only a stale, unverified account without any trace may be retired. The guarded update
        // is the check itself, so two concurrent signups cannot both pass it.
        const { count } = await tx.player.updateMany({
          where: {
            id: existing.id,
            deletedAt: null,
            emailVerifiedAt: null,
            createdAt: { lt: new Date(i.now.getTime() - STALE_UNVERIFIED_MS) },
            memberships: { none: {} },
            invitationUses: { none: {} },
            participations: { none: {} },
            jokersUsed: { none: {} },
            matchesScored: { none: {} },
          },
          data: {
            name: "Stillgelegtes Konto",
            email: `stillgelegt-${existing.id}@anonym.invalid`,
            username: null,
            passwordHash: null,
            pendingEmail: null,
            avatarData: null,
            avatarMimeType: null,
            avatarVersion: 0,
            telegramId: null,
            activeGroupId: null,
            deletedAt: i.now,
            sessionVersion: { increment: 1 },
          },
        });
        if (count !== 1) throw new EmailTakenError(email);
        await tx.emailToken.deleteMany({ where: { playerId: existing.id } });
        await tx.pushDevice.deleteMany({ where: { playerId: existing.id } });
      }
      const player = await tx.player.create({
        data: { name: i.name, email, passwordHash, termsAcceptedAt: i.now, emailVerifiedAt: null },
        select: { id: true },
      });
      return { playerId: player.id, result: await inTx(tx, player.id) };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target ?? []) as string[];
      if (target.includes("email")) throw new EmailTakenError(email);
    }
    throw e;
  }
  try {
    await sendVerification({ playerId: out.playerId });
  } catch (e) {
    console.error("[signup] verification mail failed", e);
  }
  return out;
}

/** Self-service signup without an invitation: an account without a group (founds or joins one next). */
export async function signupOpen(i: SignupInput & { now?: Date }): Promise<{ playerId: string }> {
  const now = i.now ?? new Date();
  const { playerId } = await createSignedUpPlayer({ ...i, now }, async (tx, id) => {
    await tx.auditLog.create({
      data: { actorId: id, groupId: null, action: "player.signup", entityType: "Player", entityId: id, payload: { kind: "open" } },
    });
  });
  return { playerId };
}
