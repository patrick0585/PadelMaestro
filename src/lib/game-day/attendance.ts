import { prisma } from "@/lib/db";
import type { AttendanceStatus } from "@prisma/client";

export class GameDayNotFoundError extends Error {
  constructor(gameDayId: string) {
    super(`game day not found: ${gameDayId}`);
    this.name = "GameDayNotFoundError";
  }
}

export class ParticipantNotFoundError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ParticipantNotFoundError";
  }
}

export class GameDayLockedError extends Error {
  constructor(gameDayId: string) {
    super(`game day ${gameDayId} is locked; attendance can no longer be changed`);
    this.name = "GameDayLockedError";
  }
}

export class PlayerNotFoundError extends Error {
  constructor(playerId: string) {
    super(`player not found or inactive: ${playerId}`);
    this.name = "PlayerNotFoundError";
  }
}

export async function setAttendance(
  gameDayId: string,
  playerId: string,
  attendance: AttendanceStatus,
) {
  const day = await prisma.gameDay.findUniqueOrThrow({ where: { id: gameDayId } });
  if (day.status !== "planned") {
    throw new Error("Game day is locked; attendance can no longer be changed");
  }

  return prisma.gameDayParticipant.update({
    where: { gameDayId_playerId: { gameDayId, playerId } },
    data: { attendance, respondedAt: new Date() },
  });
}

export async function joinGameDay(gameDayId: string, playerId: string) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "GameDay" WHERE id = ${gameDayId} FOR UPDATE
    `;
    if (locked.length === 0) throw new GameDayNotFoundError(gameDayId);

    const day = await tx.gameDay.findUnique({ where: { id: gameDayId } });
    if (!day) throw new GameDayNotFoundError(gameDayId);
    if (day.status !== "planned") throw new GameDayLockedError(gameDayId);

    const player = await tx.player.findUnique({
      where: { id: playerId },
      select: { id: true, deletedAt: true },
    });
    if (!player || player.deletedAt) throw new PlayerNotFoundError(playerId);

    const existing = await tx.gameDayParticipant.findUnique({
      where: { gameDayId_playerId: { gameDayId, playerId } },
    });
    if (existing) return existing;

    const created = await tx.gameDayParticipant.create({
      data: { gameDayId, playerId },
    });
    await tx.auditLog.create({
      data: {
        actorId: playerId,
        action: "game_day.self_join",
        entityType: "GameDayParticipant",
        entityId: created.id,
        payload: { gameDayId, playerId },
      },
    });
    return created;
  });
}

export async function setAttendanceAsAdmin(
  gameDayId: string,
  playerId: string,
  attendance: AttendanceStatus,
  actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    const day = await tx.gameDay.findUnique({ where: { id: gameDayId } });
    if (!day) throw new GameDayNotFoundError(gameDayId);
    if (day.status !== "planned") throw new GameDayLockedError(gameDayId);

    const existing = await tx.gameDayParticipant.findUnique({
      where: { gameDayId_playerId: { gameDayId, playerId } },
    });
    if (!existing) {
      throw new ParticipantNotFoundError(
        `player ${playerId} is not a participant of game day ${gameDayId}`,
      );
    }

    const updated = await tx.gameDayParticipant.update({
      where: { gameDayId_playerId: { gameDayId, playerId } },
      data: { attendance, respondedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "game_day.admin_set_attendance",
        entityType: "GameDayParticipant",
        entityId: updated.id,
        payload: {
          gameDayId,
          playerId,
          attendance,
          previousAttendance: existing.attendance,
        },
      },
    });
    return updated;
  });
}
