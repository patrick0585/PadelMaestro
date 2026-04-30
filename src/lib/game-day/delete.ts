import { prisma } from "@/lib/db";
import { GameDayNotFoundError } from "./attendance";

export class GameDayNotDeletableError extends Error {
  constructor(status: string) {
    super(`game day cannot be deleted in status ${status}`);
    this.name = "GameDayNotDeletableError";
  }
}

export async function deleteGameDay(gameDayId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const day = await tx.gameDay.findUnique({ where: { id: gameDayId } });
    if (!day) throw new GameDayNotFoundError(gameDayId);
    // Once Spielbetrieb starts (in_progress), the admin must finish
    // the day rather than delete it. Only planned days are deletable.
    if (day.status !== "planned") {
      throw new GameDayNotDeletableError(day.status);
    }

    await tx.gameDay.delete({ where: { id: gameDayId } });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "game_day.delete",
        entityType: "GameDay",
        entityId: gameDayId,
        payload: {
          date: day.date.toISOString(),
          status: day.status,
          playerCount: day.playerCount,
        },
      },
    });
  });
}
