import { prisma } from "@/lib/db";
import { GameDayNotFoundError } from "./attendance";
import { GameDayNotActiveError } from "./add-extra-match";

export class GameDayAlreadyFinishedError extends Error {
  constructor(gameDayId: string) {
    super(`game day ${gameDayId} is already finished`);
    this.name = "GameDayAlreadyFinishedError";
  }
}

export async function finishGameDay(gameDayId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const day = await tx.gameDay.findUnique({ where: { id: gameDayId } });
    if (!day) throw new GameDayNotFoundError(gameDayId);
    if (day.status === "finished") throw new GameDayAlreadyFinishedError(gameDayId);
    if (day.status !== "in_progress") throw new GameDayNotActiveError(day.status);

    await tx.gameDay.update({
      where: { id: gameDayId },
      data: { status: "finished" },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "game_day.finish",
        entityType: "GameDay",
        entityId: gameDayId,
        payload: { finishedAt: new Date().toISOString() },
      },
    });
  });
}
