import { prisma } from "@/lib/db";
import { assignPlayersToTemplate } from "@/lib/pairings/assign";
import { generateSeed } from "@/lib/pairings/shuffle";

export class GameDayAlreadyLockedError extends Error {
  constructor() {
    super("game day is already locked or finished");
    this.name = "GameDayAlreadyLockedError";
  }
}

export class InsufficientPlayersError extends Error {
  constructor() {
    super("need at least 4 confirmed players");
    this.name = "InsufficientPlayersError";
  }
}

export class TooManyPlayersError extends Error {
  constructor() {
    super("at most 6 confirmed players allowed");
    this.name = "TooManyPlayersError";
  }
}

export async function lockRoster(gameDayId: string, actorId: string) {
  const day = await prisma.gameDay.findUniqueOrThrow({
    where: { id: gameDayId },
    include: { participants: { include: { player: true } } },
  });

  if (day.status !== "planned") {
    throw new GameDayAlreadyLockedError();
  }

  const confirmed = day.participants.filter((p) => p.attendance === "confirmed");
  if (confirmed.length < 4) throw new InsufficientPlayersError();
  if (confirmed.length > 6) throw new TooManyPlayersError();

  const players = confirmed.map((p) => ({ id: p.player.id, name: p.player.name }));
  const seed = generateSeed();
  const plans = assignPlayersToTemplate(players, seed);

  return prisma.$transaction(async (tx) => {
    await tx.gameDay.update({
      where: { id: gameDayId },
      data: {
        status: "roster_locked",
        playerCount: players.length,
        seed,
      },
    });

    for (const plan of plans) {
      await tx.match.create({
        data: {
          gameDayId,
          matchNumber: plan.matchNumber,
          team1PlayerAId: plan.team1[0].id,
          team1PlayerBId: plan.team1[1].id,
          team2PlayerAId: plan.team2[0].id,
          team2PlayerBId: plan.team2[1].id,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: "game_day.lock",
        entityType: "GameDay",
        entityId: gameDayId,
        payload: { playerCount: players.length, seed, matches: plans.length },
      },
    });

    return tx.gameDay.findUniqueOrThrow({
      where: { id: gameDayId },
      include: { matches: { orderBy: { matchNumber: "asc" } } },
    });
  });
}
