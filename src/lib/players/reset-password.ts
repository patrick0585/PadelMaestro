import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/hash";
import { findGroupMembership, isSharedAccount } from "@/lib/group/active-membership";
import { OwnerProtectedError, PlayerNotFoundError, SharedAccountError } from "./errors";
export { PlayerNotFoundError } from "./errors";

export interface ResetPlayerPasswordInput {
  groupId: string;
  playerId: string;
  password: string;
  actorId: string;
}

export async function resetPlayerPassword(input: ResetPlayerPasswordInput): Promise<void> {
  const membership = await findGroupMembership(prisma, input.groupId, input.playerId);
  if (!membership) throw new PlayerNotFoundError(input.playerId);
  if (membership.role === "owner" && input.actorId !== input.playerId) {
    throw new OwnerProtectedError("only the owner may change the owner's password");
  }
  if (
    input.actorId !== input.playerId &&
    (await isSharedAccount(prisma, input.playerId, input.groupId))
  ) {
    throw new SharedAccountError();
  }

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: input.playerId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        groupId: input.groupId,
        action: "player.password_reset",
        entityType: "Player",
        entityId: input.playerId,
        payload: { playerId: input.playerId },
      },
    });
  });
}
