import { prisma } from "@/lib/db";

export async function getSeasonGroupId(seasonId: string): Promise<string> {
  const { groupId } = await prisma.season.findUniqueOrThrow({
    where: { id: seasonId },
    select: { groupId: true },
  });
  return groupId;
}
