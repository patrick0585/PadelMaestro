import { prisma } from "@/lib/db";
import { countOtherAdmins, findGroupMembership } from "@/lib/group/active-membership";
import { OwnerProtectedError } from "./owner-protected-error";

export class PlayerNotFoundError extends Error {
  constructor(id: string) {
    super(`player not found: ${id}`);
    this.name = "PlayerNotFoundError";
  }
}
export class SelfDeleteError extends Error {
  constructor() {
    super("cannot delete yourself");
    this.name = "SelfDeleteError";
  }
}
export class LastAdminError extends Error {
  constructor() {
    super("cannot delete the last remaining admin");
    this.name = "LastAdminError";
  }
}
export class ActiveParticipationError extends Error {
  constructor() {
    super("player has active participation on a non-finished game day");
    this.name = "ActiveParticipationError";
  }
}

export interface DeletePlayerInput {
  groupId: string;
  playerId: string;
  actorId: string;
}

export async function deletePlayer(input: DeletePlayerInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const target = await tx.player.findUnique({
      where: { id: input.playerId },
      select: { id: true, name: true, email: true, deletedAt: true },
    });
    const membership = await findGroupMembership(tx, input.groupId, input.playerId);
    if (!target || target.deletedAt || !membership) {
      throw new PlayerNotFoundError(input.playerId);
    }

    if (target.id === input.actorId) throw new SelfDeleteError();

    if (membership.role === "owner") throw new OwnerProtectedError();

    if (
      membership.role === "admin" &&
      (await countOtherAdmins(tx, input.groupId, target.id)) === 0
    ) {
      throw new LastAdminError();
    }

    const activeParticipation = await tx.gameDayParticipant.findFirst({
      where: {
        playerId: target.id,
        attendance: { in: ["confirmed", "joker"] },
        gameDay: { groupId: input.groupId, status: { in: ["planned", "in_progress"] } },
      },
      select: { id: true },
    });
    if (activeParticipation) throw new ActiveParticipationError();

    const now = new Date();
    await tx.membership.update({
      where: { groupId_playerId: { groupId: input.groupId, playerId: target.id } },
      data: { removedAt: now },
    });
    await tx.player.update({
      where: { id: target.id },
      data: { deletedAt: now },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "player.delete",
        entityType: "Player",
        entityId: target.id,
        payload: { name: target.name, email: target.email },
      },
    });
  });
}
