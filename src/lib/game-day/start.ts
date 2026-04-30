import { prisma } from "@/lib/db";
import { assignPlayersToTemplate } from "@/lib/pairings/assign";

export class GameDayAlreadyStartedError extends Error {
  constructor() {
    super("game day is already started or finished");
    this.name = "GameDayAlreadyStartedError";
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

// Atomically generates the match plan, persists it, and flips the game
// day from planned → in_progress. Replaces the old lockRoster +
// implicit auto-start sequence with a single explicit step.
export async function startGameDay(gameDayId: string, actorId: string) {
  const day = await prisma.gameDay.findUniqueOrThrow({
    where: { id: gameDayId },
    include: { participants: { include: { player: true } } },
  });

  if (day.status !== "planned") {
    throw new GameDayAlreadyStartedError();
  }

  const confirmed = day.participants.filter((p) => p.attendance === "confirmed");
  if (confirmed.length < 4) throw new InsufficientPlayersError();
  if (confirmed.length > 6) throw new TooManyPlayersError();

  const players = confirmed.map((p) => ({ id: p.player.id, name: p.player.name }));
  // Reuse the seed the preview ran on (set either when the admin
  // pressed "Reihenfolge mischen" or, by default, falling back to the
  // gameDay.id below). That keeps preview = reality.
  const seed = day.seed ?? day.id;
  const plans = assignPlayersToTemplate(players, seed);

  return prisma.$transaction(async (tx) => {
    await tx.gameDay.update({
      where: { id: gameDayId },
      data: {
        status: "in_progress",
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
        action: "game_day.start",
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
