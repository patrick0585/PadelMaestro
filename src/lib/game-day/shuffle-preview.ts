import { prisma } from "@/lib/db";
import { generateSeed } from "@/lib/pairings/shuffle";

export class GameDayNotPlannedError extends Error {
  constructor(status: string) {
    super(`shuffle-preview only allowed in status=planned (was ${status})`);
    this.name = "GameDayNotPlannedError";
  }
}

// Persists a fresh seed on the game day so the next preview render
// produces a different player→slot mapping. Only allowed while the
// day is still in the planned state — once Spielbetrieb starts, the
// seed is locked in by the matches it produced.
export async function shufflePreviewSeed(gameDayId: string, actorId: string) {
  const day = await prisma.gameDay.findUniqueOrThrow({
    where: { id: gameDayId },
    select: { id: true, status: true },
  });
  if (day.status !== "planned") {
    throw new GameDayNotPlannedError(day.status);
  }
  const seed = generateSeed();
  await prisma.$transaction(async (tx) => {
    await tx.gameDay.update({ where: { id: gameDayId }, data: { seed } });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "game_day.shuffle_preview",
        entityType: "GameDay",
        entityId: gameDayId,
        payload: { seed },
      },
    });
  });
  return { seed };
}
