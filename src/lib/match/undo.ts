import { prisma } from "@/lib/db";

const UNDO_WINDOW_MS = 2 * 60 * 1000;

export async function undoScore(args: { matchId: string; actorId: string }) {
  const match = await prisma.match.findUniqueOrThrow({ where: { id: args.matchId } });
  const actor = await prisma.player.findUniqueOrThrow({ where: { id: args.actorId } });

  if (match.team1Score === null) {
    throw new Error("Match has no score to undo");
  }

  const isOriginalScorer = match.scoredById === args.actorId;
  if (!isOriginalScorer && !actor.isAdmin) {
    throw new Error("No permission to undo this score");
  }

  if (match.scoredAt) {
    const age = Date.now() - match.scoredAt.getTime();
    if (age > UNDO_WINDOW_MS) {
      throw new Error("Undo window (2 minutes) has passed");
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
