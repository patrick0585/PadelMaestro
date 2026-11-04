import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export {
  DEFAULT_JOKERS_PER_SEASON,
  DEFAULT_JOKER_GAMES_CREDITED,
} from "@/lib/joker/constants";

export type GroupRules = { jokersPerSeason: number; jokerGamesCredited: number };

export async function getGroupRules(
  groupId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<GroupRules> {
  return db.group.findUniqueOrThrow({
    where: { id: groupId },
    select: { jokersPerSeason: true, jokerGamesCredited: true },
  });
}
