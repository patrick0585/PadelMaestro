import { prisma } from "@/lib/db";

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
  playerId: string;
  actorId: string;
}

export async function deletePlayer(input: DeletePlayerInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const target = await tx.player.findUnique({
      where: { id: input.playerId },
      select: { id: true, name: true, email: true, isAdmin: true, deletedAt: true },
    });
    if (!target || target.deletedAt) throw new PlayerNotFoundError(input.playerId);

    if (target.id === input.actorId) throw new SelfDeleteError();

    if (target.isAdmin) {
      const remainingAdmins = await tx.player.count({
        where: { isAdmin: true, deletedAt: null, id: { not: target.id } },
      });
      if (remainingAdmins === 0) throw new LastAdminError();
    }

    const activeParticipation = await tx.gameDayParticipant.findFirst({
      where: {
        playerId: target.id,
        attendance: { in: ["confirmed", "joker"] },
        gameDay: { status: { in: ["planned", "roster_locked", "in_progress"] } },
      },
      select: { id: true },
    });
    if (activeParticipation) throw new ActiveParticipationError();

    await tx.player.update({
      where: { id: target.id },
      data: { deletedAt: new Date() },
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
