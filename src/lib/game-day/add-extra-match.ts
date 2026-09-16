import { prisma } from "@/lib/db";
import { loadTemplate } from "@/lib/pairings/load";
import { publishGameDayUpdate } from "./live-broadcast";
import { GameDayNotFoundError } from "./attendance";
import { pickFairExtraMatch } from "./fair-extra-match";
import { CYCLED_PLAYER_COUNTS, pickCycledExtraMatch } from "./cycled-extra-match";

export class GameDayNotActiveError extends Error {
  constructor(status: string) {
    super(`game day is not active (status=${status})`);
    this.name = "GameDayNotActiveError";
  }
}

interface ExtraMatchTeams {
  team1: readonly [string, string];
  team2: readonly [string, string];
}

export async function addExtraMatch(gameDayId: string, actorId: string) {
  const match = await prisma.$transaction(async (tx) => {
    const day = await tx.gameDay.findUnique({
      where: { id: gameDayId },
      include: {
        participants: { include: { player: { select: { id: true, name: true } } } },
        matches: {
          select: {
            matchNumber: true,
            team1PlayerAId: true,
            team1PlayerBId: true,
            team2PlayerAId: true,
            team2PlayerBId: true,
          },
        },
      },
    });
    if (!day) throw new GameDayNotFoundError(gameDayId);
    if (day.status !== "in_progress") {
      throw new GameDayNotActiveError(day.status);
    }

    const nextMatchNumber = Math.max(0, ...day.matches.map((m) => m.matchNumber)) + 1;
    let teams: ExtraMatchTeams;
    let sourceMatchNumber: number | null = null;

    if (day.playerCount !== null && CYCLED_PLAYER_COUNTS.has(day.playerCount)) {
      const templateTotal = loadTemplate(day.playerCount).totalMatches;
      const source = pickCycledExtraMatch(day.matches, templateTotal);
      sourceMatchNumber = source.matchNumber;
      teams = {
        team1: [source.team1PlayerAId, source.team1PlayerBId],
        team2: [source.team2PlayerAId, source.team2PlayerBId],
      };
    } else {
      const confirmed = day.participants
        .filter((p) => p.attendance === "confirmed")
        .map((p) => ({ id: p.player.id, name: p.player.name }));
      if (confirmed.length < 4) {
        throw new GameDayNotActiveError(`only ${confirmed.length} confirmed players`);
      }
      const pick = pickFairExtraMatch({ matches: day.matches, confirmedPlayers: confirmed });
      teams = {
        team1: [pick.team1[0].id, pick.team1[1].id],
        team2: [pick.team2[0].id, pick.team2[1].id],
      };
    }

    const match = await tx.match.create({
      data: {
        gameDayId,
        matchNumber: nextMatchNumber,
        team1PlayerAId: teams.team1[0],
        team1PlayerBId: teams.team1[1],
        team2PlayerAId: teams.team2[0],
        team2PlayerBId: teams.team2[1],
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "game_day.add_extra_match",
        entityType: "Match",
        entityId: match.id,
        payload: {
          gameDayId,
          matchNumber: nextMatchNumber,
          // Record the chosen teams (and, when cycled, the template match
          // they were copied from) so the pick can be reproduced later.
          sourceMatchNumber,
          team1: [...teams.team1],
          team2: [...teams.team2],
        },
      },
    });

    return match;
  });

  publishGameDayUpdate(gameDayId);
  return match;
}
