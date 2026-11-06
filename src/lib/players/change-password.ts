import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/hash";
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
}

export async function changeOwnPassword(input: ChangeOwnPasswordInput): Promise<void> {
  const existing = await prisma.player.findUnique({
    where: { id: input.playerId },
    select: { id: true, deletedAt: true, passwordHash: true },
  });
  if (!existing || existing.deletedAt) throw new PlayerNotFoundError(input.playerId);

  if (existing.passwordHash) {
    const ok = input.currentPassword
      ? await verifyPassword(input.currentPassword, existing.passwordHash)
      : false;
    if (!ok) throw new WrongCurrentPasswordError();
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: input.playerId },
      data: { passwordHash },
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
