import { prisma } from "@/lib/db";

export function findGroupGameDay(
  groupId: string,
  gameDayId: string,
): Promise<{ id: string } | null> {
  return prisma.gameDay.findFirst({
    where: { id: gameDayId, groupId },
    select: { id: true },
  });
}

export function findGroupMatchGameDay(
  groupId: string,
  matchId: string,
): Promise<{ gameDayId: string } | null> {
  return prisma.match.findFirst({
    where: { id: matchId, gameDay: { groupId } },
    select: { gameDayId: true },
  });
}
