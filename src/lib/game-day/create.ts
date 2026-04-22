import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getOrCreateActiveSeason } from "@/lib/season";

export class GameDayDateExistsError extends Error {
  constructor(date: Date) {
    super(`game day for ${date.toISOString().slice(0, 10)} already exists`);
    this.name = "GameDayDateExistsError";
  }
}

export async function createGameDay(date: Date, actorId: string) {
  const season = await getOrCreateActiveSeason();
  const players = await prisma.player.findMany({ where: { deletedAt: null } });

  try {
    return await prisma.$transaction(async (tx) => {
      const day = await tx.gameDay.create({
        data: {
          seasonId: season.id,
          date,
          status: "planned",
          participants: {
            create: players.map((p) => ({ playerId: p.id })),
          },
        },
        include: { participants: true },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: "game_day.create",
          entityType: "GameDay",
          entityId: day.id,
          payload: { date: date.toISOString() },
        },
      });

      return day;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const fields = (e.meta?.target ?? []) as string[];
      if (
        fields.length === 2 &&
        fields.includes("seasonId") &&
        fields.includes("date")
      ) {
        throw new GameDayDateExistsError(date);
      }
      throw e;
    }
    throw e;
  }
}
