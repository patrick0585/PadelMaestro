import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/auth/group-context";
import { PlayerNotFoundError } from "@/lib/players/errors";
import { findGroupMembership } from "./active-membership";

export class SelfTransferError extends Error {
  constructor() {
    super("cannot transfer ownership to yourself");
    this.name = "SelfTransferError";
  }
}

export class TargetCannotLoginError extends Error {
  constructor() {
    super("new owner has no password or a deleted account");
    this.name = "TargetCannotLoginError";
  }
}

export async function transferOwnership(i: {
  groupId: string;
  actorId: string;
  newOwnerId: string;
}): Promise<void> {
  const { groupId, actorId, newOwnerId } = i;
  await prisma.$transaction(async (tx) => {
    const actor = await findGroupMembership(tx, groupId, actorId);
    if (actor?.role !== "owner") throw new ForbiddenError();
    if (newOwnerId === actorId) throw new SelfTransferError();
    if (!(await findGroupMembership(tx, groupId, newOwnerId))) {
      throw new PlayerNotFoundError(newOwnerId);
    }
    const target = await tx.player.findUnique({
      where: { id: newOwnerId },
      select: { passwordHash: true, deletedAt: true },
    });
    if (!target?.passwordHash || target.deletedAt) throw new TargetCannotLoginError();

    // Conditional updates: a concurrent removal or transfer makes count 0 and rolls back.
    const promoted = await tx.membership.updateMany({
      where: {
        groupId,
        playerId: newOwnerId,
        removedAt: null,
        player: { passwordHash: { not: null }, deletedAt: null },
      },
      data: { role: "owner" },
    });
    if (promoted.count !== 1) throw new PlayerNotFoundError(newOwnerId);

    const demoted = await tx.membership.updateMany({
      where: { groupId, playerId: actorId, role: "owner" },
      data: { role: "admin" },
    });
    if (demoted.count !== 1) throw new ForbiddenError();

    await tx.auditLog.create({
      data: {
        actorId,
        groupId,
        action: "group.transfer_owner",
        entityType: "Group",
        entityId: groupId,
        payload: { from: actorId, to: newOwnerId },
      },
    });
  });
}
