import { prisma } from "@/lib/db";
import { GameDayNotFoundError } from "./attendance";

export class GameDayStartTimeLockedError extends Error {
  constructor(status: string) {
    super(`start time cannot be changed in status ${status}`);
    this.name = "GameDayStartTimeLockedError";
  }
}

export async function setGameDayStartTime(
  gameDayId: string,
  startTime: string | null,
  actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    const day = await tx.gameDay.findUnique({ where: { id: gameDayId } });
    if (!day) throw new GameDayNotFoundError(gameDayId);
    if (day.status !== "planned") throw new GameDayStartTimeLockedError(day.status);

    await tx.gameDay.update({ where: { id: gameDayId }, data: { startTime } });
    await tx.auditLog.create({
      data: {
        actorId,
        groupId: day.groupId,
        action: "game_day.start_time",
        entityType: "GameDay",
        entityId: gameDayId,
        payload: { from: day.startTime, to: startTime },
      },
    });
  });
}
