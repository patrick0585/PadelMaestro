import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/hash";
import { assertFreshAppleProof } from "@/lib/auth/apple/reauth";
import type { AppleIdentity } from "@/lib/auth/apple/verify";
import { PlayerNotFoundError } from "./errors";
export { PlayerNotFoundError } from "./errors";

export class WrongCurrentPasswordError extends Error {
  constructor() {
    super("wrong current password");
    this.name = "WrongCurrentPasswordError";
  }
}

export interface ChangeOwnPasswordInput {
  playerId: string;
  /** Omitted only for accounts without a password (Apple sign-up) that set their first one. */
  currentPassword?: string;
  newPassword: string;
  /** Required when an Apple-linked account without a password sets its first one. */
  appleProof?: AppleIdentity;
  now?: Date;
}

export async function changeOwnPassword(input: ChangeOwnPasswordInput): Promise<void> {
  const existing = await prisma.player.findUnique({
    where: { id: input.playerId },
    select: { id: true, deletedAt: true, passwordHash: true, appleSub: true },
  });
  if (!existing || existing.deletedAt) throw new PlayerNotFoundError(input.playerId);

  if (existing.passwordHash) {
    const ok = input.currentPassword
      ? await verifyPassword(input.currentPassword, existing.passwordHash)
      : false;
    if (!ok) throw new WrongCurrentPasswordError();
  } else if (input.currentPassword) {
    throw new PlayerNotFoundError(input.playerId);
  } else if (existing.appleSub) {
    assertFreshAppleProof(existing.appleSub, input.appleProof, input.now);
  }

  const firstPassword = !existing.passwordHash;
  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: input.playerId },
      data: { passwordHash, ...(firstPassword && { sessionVersion: { increment: 1 } }) },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.playerId,
        action: "player.password_change",
        entityType: "Player",
        entityId: input.playerId,
        payload: { playerId: input.playerId },
      },
    });
  });
}
