import { prisma } from "@/lib/db";

export interface LiveStripData {
  current: number | null; // first unscored match; null once every match is scored
  total: number;
}

/** Running game day of the group for the header strip, or null when nothing is live. */
export async function loadLiveStrip(groupId: string | null): Promise<LiveStripData | null> {
  if (!groupId) return null;
  const day = await prisma.gameDay.findFirst({
    where: { groupId, status: "in_progress" },
    orderBy: { date: "asc" },
    select: { matches: { select: { matchNumber: true, team1Score: true, team2Score: true }, orderBy: { matchNumber: "asc" } } },
  });
  if (!day) return null;
  const open = day.matches.find((m) => m.team1Score === null || m.team2Score === null);
  return { current: open?.matchNumber ?? null, total: day.matches.length };
}
