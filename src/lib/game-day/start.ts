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

  return prisma.$transaction(async (tx) => {
    // Re-read inside the transaction so a concurrent
    // shuffle-preview that landed between the outer read and this
    // moment is observed. Seed precedence: any persisted seed
    // (from a shuffle) wins, otherwise day.id is the stable
    // fallback so preview = reality even without a shuffle.
    const inTx = await tx.gameDay.findUniqueOrThrow({
      where: { id: gameDayId },
      select: { status: true, seed: true },
    });
    if (inTx.status !== "planned") {
      throw new GameDayAlreadyStartedError();
    }
    const seed = inTx.seed ?? gameDayId;
    const plans = assignPlayersToTemplate(players, seed);

    // Optimistic lock: only flip if status AND seed are still what
    // we just observed. A concurrent shuffle would have moved seed,
    // and updateMany.count = 0 surfaces the race cleanly.
    const flipped = await tx.gameDay.updateMany({
      where: { id: gameDayId, status: "planned", seed: inTx.seed },
      data: {
        status: "in_progress",
        playerCount: players.length,
        seed,
      },
    });
    if (flipped.count === 0) {
      throw new GameDayAlreadyStartedError();
    }

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
