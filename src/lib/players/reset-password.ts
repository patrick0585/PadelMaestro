import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/hash";
import { findGroupMembership } from "@/lib/group/active-membership";

export class PlayerNotFoundError extends Error {
  constructor(id: string) {
    super(`player not found: ${id}`);
    this.name = "PlayerNotFoundError";
  }
}

export interface ResetPlayerPasswordInput {
  groupId: string;
  playerId: string;
  password: string;
  actorId: string;
}

export async function resetPlayerPassword(input: ResetPlayerPasswordInput): Promise<void> {
  const membership = await findGroupMembership(prisma, input.groupId, input.playerId);
  if (!membership) throw new PlayerNotFoundError(input.playerId);

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
