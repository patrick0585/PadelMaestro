import { prisma } from "@/lib/db";
import { validateScore } from "./validate";
import type { MatchFormat } from "@/lib/pairings/types";
import { publishGameDayUpdate } from "@/lib/game-day/live-broadcast";

export class ScoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoreConflictError";
  }
}

export class GameDayFinishedError extends Error {
  constructor(gameDayId: string) {
    super(`game day ${gameDayId} is finished; scores can no longer be changed`);
    this.name = "GameDayFinishedError";
  }
}

export class NotAllowedError extends Error {
  constructor(message = "not allowed") {
    super(message);
    this.name = "NotAllowedError";
  }
}

export class InvalidScoreError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidScoreError";
  }
}

export interface EnterScoreInput {
  matchId: string;
  team1Score: number;
  team2Score: number;
  scoredBy: string;
  expectedVersion: number;
  isAdmin?: boolean;
}

export class GameDayNotStartedError extends Error {
  constructor(gameDayId: string) {
    super(`game day ${gameDayId} has not been started yet`);
    this.name = "GameDayNotStartedError";
  }
}

export async function enterScore(input: EnterScoreInput) {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: input.matchId },
    include: { gameDay: true },
  });

  if (match.gameDay.status === "finished") {
    throw new GameDayFinishedError(match.gameDayId);
  }
  if (match.gameDay.status !== "in_progress") {
    throw new GameDayNotStartedError(match.gameDayId);
  }

  if (!input.isAdmin) {
    const dayParticipant = await prisma.gameDayParticipant.findUnique({
      where: { gameDayId_playerId: { gameDayId: match.gameDayId, playerId: input.scoredBy } },
      select: { attendance: true },
    });
    const isOnRoster =
      dayParticipant?.attendance === "confirmed" || dayParticipant?.attendance === "joker";
    if (!isOnRoster) {
      throw new NotAllowedError("only confirmed participants or admins can enter a score");
    }
  }

  const format: MatchFormat = match.gameDay.playerCount === 4 ? "tennis-set" : "sum-to-3";
  const v = validateScore(input.team1Score, input.team2Score, format);
  if (!v.ok) throw new InvalidScoreError(v.reason);

  const result = await prisma.match.updateMany({
    where: { id: input.matchId, version: input.expectedVersion },
    data: {
      team1Score: input.team1Score,
      team2Score: input.team2Score,
      scoredById: input.scoredBy,
      scoredAt: new Date(),
      version: { increment: 1 },
    },
  });

  if (result.count === 0) {
    throw new ScoreConflictError(`Match ${input.matchId} was already updated by someone else`);
  }

  publishGameDayUpdate(match.gameDayId);

  return prisma.match.findUniqueOrThrow({ where: { id: input.matchId } });
}
