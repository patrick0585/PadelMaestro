import type { Prisma, PrismaClient } from "@prisma/client";
import { findActiveMembership } from "@/lib/group/active-membership";
import type { PlayerLookup } from "@/lib/auth/refresh-token";

export async function findPlayerForRefresh(
  db: PrismaClient | Prisma.TransactionClient,
  id: string,
): Promise<PlayerLookup | null> {
  const player = await db.player.findUnique({
    where: { id },
    select: { username: true, deletedAt: true },
  });
  if (!player) return null;
  return {
    username: player.username,
    deletedAt: player.deletedAt,
    membership: await findActiveMembership(db, id),
  };
}
