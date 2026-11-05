import { prisma } from "@/lib/db";

/**
 * The game day the Spieltag tab is about: a running day always wins, otherwise
 * the next planned one. Same precedence as the home page tickets.
 */
export async function findCurrentGameDayId(groupId: string): Promise<string | null> {
  const running = await prisma.gameDay.findFirst({
    where: { groupId, status: "in_progress" },
    orderBy: { date: "asc" },
    select: { id: true },
  });
  if (running) return running.id;
  const planned = await prisma.gameDay.findFirst({
    where: { groupId, status: "planned" },
    orderBy: { date: "asc" },
    select: { id: true },
  });
  return planned?.id ?? null;
}
