import { prisma } from "@/lib/db";
import { publishGameDayUpdate } from "./live-broadcast";
import { GameDayNotFoundError } from "./attendance";
import { pickFairExtraMatch } from "./fair-extra-match";

export class GameDayNotActiveError extends Error {
  constructor(status: string) {
    super(`game day is not active (status=${status})`);
    this.name = "GameDayNotActiveError";
  }
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

    const confirmed = day.participants
      .filter((p) => p.attendance === "confirmed")
      .map((p) => ({ id: p.player.id, name: p.player.name }));
    if (confirmed.length < 4) {
      throw new GameDayNotActiveError(`only ${confirmed.length} confirmed players`);
    }

    const pick = pickFairExtraMatch({
      matches: day.matches,
      confirmedPlayers: confirmed,
    });
    const nextMatchNumber = Math.max(0, ...day.matches.map((m) => m.matchNumber)) + 1;

    const match = await tx.match.create({
      data: {
        gameDayId,
        matchNumber: nextMatchNumber,
        team1PlayerAId: pick.team1[0].id,
        team1PlayerBId: pick.team1[1].id,
        team2PlayerAId: pick.team2[0].id,
        team2PlayerBId: pick.team2[1].id,
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
          // pickFairExtraMatch chose this set; record it for an audit
          // trail so we can later reproduce why a given match showed up.
          team1: [pick.team1[0].id, pick.team1[1].id],
          team2: [pick.team2[0].id, pick.team2[1].id],
        },
      },
    });

    return match;
  });

  publishGameDayUpdate(gameDayId);
  return match;
}
