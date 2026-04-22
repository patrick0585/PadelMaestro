import { prisma } from "@/lib/db";
import { loadTemplate } from "@/lib/pairings/load";
import { generateSeed, seededShuffle } from "@/lib/pairings/shuffle";
import { GameDayNotFoundError } from "./attendance";

export class GameDayNotActiveError extends Error {
  constructor(status: string) {
    super(`game day is not active (status=${status})`);
    this.name = "GameDayNotActiveError";
  }
}

export async function addExtraMatch(gameDayId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const day = await tx.gameDay.findUnique({
      where: { id: gameDayId },
      include: {
        participants: { include: { player: { select: { id: true, name: true } } } },
        matches: { select: { matchNumber: true } },
      },
    });
    if (!day) throw new GameDayNotFoundError(gameDayId);
    if (day.status !== "roster_locked" && day.status !== "in_progress") {
      throw new GameDayNotActiveError(day.status);
    }

    const confirmed = day.participants
      .filter((p) => p.attendance === "confirmed")
      .map((p) => ({ id: p.player.id, name: p.player.name }));
    if (confirmed.length < 4) {
      throw new GameDayNotActiveError(`only ${confirmed.length} confirmed players`);
    }

    const template = loadTemplate(Math.min(confirmed.length, 6));
    const slot = template.matches[Math.floor(Math.random() * template.matches.length)];
    const seed = generateSeed();
    const shuffled = seededShuffle(confirmed, seed);
    const nextMatchNumber = Math.max(0, ...day.matches.map((m) => m.matchNumber)) + 1;

    const match = await tx.match.create({
      data: {
        gameDayId,
        matchNumber: nextMatchNumber,
        team1PlayerAId: shuffled[slot.team1[0] - 1].id,
        team1PlayerBId: shuffled[slot.team1[1] - 1].id,
        team2PlayerAId: shuffled[slot.team2[0] - 1].id,
        team2PlayerBId: shuffled[slot.team2[1] - 1].id,
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
          templateSlot: slot.matchNumber,
          seed,
        },
      },
    });

    return match;
  });
}
