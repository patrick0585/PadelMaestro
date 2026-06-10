import { prisma } from "@/lib/db";
import { loadTemplate } from "@/lib/pairings/load";
import { publishGameDayUpdate } from "./live-broadcast";
import { GameDayNotActiveError } from "./add-extra-match";

export class MatchNotFoundError extends Error {
  constructor(matchId: string) {
    super(`match not found: ${matchId}`);
    this.name = "MatchNotFoundError";
  }
}

export class NotAnExtraMatchError extends Error {
  constructor(matchNumber: number, templateTotal: number) {
    super(
      `match ${matchNumber} belongs to the template (≤ ${templateTotal}) and cannot be removed`,
    );
    this.name = "NotAnExtraMatchError";
  }
}

// Removes a manually added extra match and renumbers the matches that
// followed it so no gap remains in matchNumber. Template matches (the
// fixed round-robin plan, matchNumber ≤ template.totalMatches) are never
// removable. Only valid while the game day is in_progress.
//
// The match is looked up scoped to gameDayId so a mismatched URL
// (/game-days/<A>/matches/<match-of-B>) is rejected as not-found rather
// than silently deleting a match from a different day.
export async function removeExtraMatch(
  gameDayId: string,
  matchId: string,
  actorId: string,
) {
  await prisma.$transaction(async (tx) => {
    const match = await tx.match.findFirst({
      where: { id: matchId, gameDayId },
      select: {
        gameDayId: true,
        matchNumber: true,
        team1Score: true,
        team2Score: true,
        gameDay: { select: { status: true, playerCount: true } },
      },
    });
    if (!match) throw new MatchNotFoundError(matchId);

    if (match.gameDay.status !== "in_progress") {
      throw new GameDayNotActiveError(match.gameDay.status);
    }

    // playerCount is set the moment a day flips to in_progress, so this
    // is defensive — a null here would mean a corrupt row.
    const templateTotal = match.gameDay.playerCount
      ? loadTemplate(match.gameDay.playerCount).totalMatches
      : Number.POSITIVE_INFINITY;
    if (match.matchNumber <= templateTotal) {
      throw new NotAnExtraMatchError(match.matchNumber, templateTotal);
    }

    await tx.match.delete({ where: { id: matchId } });

    // Renumber the trailing extra matches one-by-one in ascending order.
    // A bulk `{ decrement: 1 }` would risk a transient unique violation on
    // @@unique([gameDayId, matchNumber]) because Postgres checks the
    // constraint row-by-row. Deleting N first frees slot N; updating the
    // remaining matches ascending keeps every target slot free.
    const trailing = await tx.match.findMany({
      where: { gameDayId: match.gameDayId, matchNumber: { gt: match.matchNumber } },
      orderBy: { matchNumber: "asc" },
      select: { id: true, matchNumber: true },
    });
    for (const m of trailing) {
      await tx.match.update({
        where: { id: m.id },
        data: { matchNumber: m.matchNumber - 1 },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: "game_day.remove_extra_match",
        entityType: "Match",
        entityId: matchId,
        payload: {
          gameDayId: match.gameDayId,
          matchNumber: match.matchNumber,
          hadScore: match.team1Score !== null && match.team2Score !== null,
          team1Score: match.team1Score,
          team2Score: match.team2Score,
        },
      },
    });
  });

  publishGameDayUpdate(gameDayId);
  return { gameDayId };
}
