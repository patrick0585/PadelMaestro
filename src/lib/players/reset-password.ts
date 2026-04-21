import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/hash";

export class PlayerNotFoundError extends Error {
  constructor(id: string) {
    super(`player not found: ${id}`);
    this.name = "PlayerNotFoundError";
  }
}

export interface ResetPlayerPasswordInput {
  playerId: string;
  password: string;
  actorId: string;
}

export async function resetPlayerPassword(input: ResetPlayerPasswordInput): Promise<void> {
  const existing = await prisma.player.findUnique({
    where: { id: input.playerId },
    select: { id: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) throw new PlayerNotFoundError(input.playerId);

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: input.playerId },
      data: { passwordHash },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "player.password_reset",
        entityType: "Player",
        entityId: input.playerId,
        payload: { playerId: input.playerId },
      },
    });
  });
}
