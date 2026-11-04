import { prisma } from "@/lib/db";

async function activeMembers(gameDayId: string, extra: object) {
  const day = await prisma.gameDay.findUnique({ where: { id: gameDayId }, select: { groupId: true } });
  if (!day) return null;
  const members = await prisma.membership.findMany({
    where: { groupId: day.groupId, removedAt: null, player: { deletedAt: null, ...extra } },
    select: { playerId: true },
  });
  return members.map((m) => m.playerId);
}

export async function newGameDayRecipients(gameDayId: string, excludePlayerId: string): Promise<string[]> {
  const ids = await activeMembers(gameDayId, {});
  return (ids ?? []).filter((id) => id !== excludePlayerId);
}

export async function reminderRecipients(gameDayId: string): Promise<string[]> {
  const ids = await activeMembers(gameDayId, { pushRemindersEnabled: true });
  if (!ids || ids.length === 0) return [];
  const answered = await prisma.gameDayParticipant.findMany({
    where: { gameDayId, playerId: { in: ids }, attendance: { not: "pending" } },
    select: { playerId: true },
  });
  const done = new Set(answered.map((a) => a.playerId));
  return ids.filter((id) => !done.has(id));
}
