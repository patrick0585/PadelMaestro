import { prisma } from "@/lib/db";

const UNDO_WINDOW_MS = 2 * 60 * 1000;

export class NoScoreToUndoError extends Error {
  constructor() {
    super("match has no score to undo");
    this.name = "NoScoreToUndoError";
  }
}

export class UndoNotAllowedError extends Error {
  constructor() {
    super("no permission to undo this score");
    this.name = "UndoNotAllowedError";
  }
}

export class UndoWindowExpiredError extends Error {
  constructor() {
    super("undo window (2 minutes) has passed");
    this.name = "UndoWindowExpiredError";
  }
}

export async function undoScore(args: { matchId: string; actorId: string }) {
  const match = await prisma.match.findUniqueOrThrow({ where: { id: args.matchId } });
  const actor = await prisma.player.findUniqueOrThrow({ where: { id: args.actorId } });

  if (match.team1Score === null) {
    throw new NoScoreToUndoError();
  }

  const isOriginalScorer = match.scoredById === args.actorId;
  if (!isOriginalScorer && !actor.isAdmin) {
    throw new UndoNotAllowedError();
  }

  if (match.scoredAt) {
    const age = Date.now() - match.scoredAt.getTime();
    if (age > UNDO_WINDOW_MS) {
      throw new UndoWindowExpiredError();
    }
  }

  return prisma.match.update({
    where: { id: args.matchId },
    data: {
      team1Score: null,
      team2Score: null,
      scoredById: null,
      scoredAt: null,
      version: { increment: 1 },
    },
  });
}
