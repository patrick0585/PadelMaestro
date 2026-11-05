import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseScoring, type ScoringRules } from "@/lib/scoring/rule";

export async function getGroupScoring(
  groupId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<ScoringRules> {
  const g = await db.group.findUniqueOrThrow({ where: { id: groupId }, select: { scoring: true } });
  return parseScoring(g.scoring);
}
