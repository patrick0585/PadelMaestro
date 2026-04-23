import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/hash";

export class PlayerNotFoundError extends Error {
  constructor(id: string) {
    super(`player not found: ${id}`);
    this.name = "PlayerNotFoundError";
  }
}

export class WrongCurrentPasswordError extends Error {
  constructor() {
    super("wrong current password");
    this.name = "WrongCurrentPasswordError";
  }
}

export interface ChangeOwnPasswordInput {
  playerId: string;
  currentPassword: string;
  newPassword: string;
}

export async function changeOwnPassword(input: ChangeOwnPasswordInput): Promise<void> {
  const existing = await prisma.player.findUnique({
    where: { id: input.playerId },
    select: { id: true, deletedAt: true, passwordHash: true },
  });
  if (!existing || existing.deletedAt || !existing.passwordHash) {
    throw new PlayerNotFoundError(input.playerId);
  }

  const ok = await verifyPassword(input.currentPassword, existing.passwordHash);
  if (!ok) throw new WrongCurrentPasswordError();

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
