import { prisma } from "@/lib/db";
import { getOrCreateActiveSeason } from "@/lib/season";

export async function createGameDay(date: Date, actorId: string) {
  const season = await getOrCreateActiveSeason();
  const players = await prisma.player.findMany({ where: { deletedAt: null } });

  return prisma.$transaction(async (tx) => {
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
}
