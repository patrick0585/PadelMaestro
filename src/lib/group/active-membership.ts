import type { Prisma, PrismaClient } from "@prisma/client";
import type { GroupRole } from "@/lib/auth/roles";

export const ACTIVE_MEMBERSHIP_ORDER = [
  { joinedAt: "desc" },
  { id: "desc" },
] as const satisfies Prisma.MembershipOrderByWithRelationInput[];

export async function findActiveMembership(
  db: Prisma.TransactionClient | PrismaClient,
  playerId: string,
): Promise<{ groupId: string; role: GroupRole } | null> {
  const player = await db.player.findUnique({
    where: { id: playerId },
    select: { activeGroupId: true },
  });
  if (player?.activeGroupId) {
    const preferred = await db.membership.findFirst({
      where: { playerId, groupId: player.activeGroupId, removedAt: null },
      select: { groupId: true, role: true },
    });
    if (preferred) return preferred;
  }
  return db.membership.findFirst({
    where: { playerId, removedAt: null },
    orderBy: [...ACTIVE_MEMBERSHIP_ORDER],
    select: { groupId: true, role: true },
  });
}

export async function countOtherAdmins(
  db: Prisma.TransactionClient | PrismaClient,
  groupId: string,
  playerId: string,
): Promise<number> {
  return db.membership.count({
    where: {
      groupId,
      removedAt: null,
      role: { in: ["admin", "owner"] },
      playerId: { not: playerId },
    },
  });
}

export async function findGroupMembership(
  db: Prisma.TransactionClient | PrismaClient,
  groupId: string,
  playerId: string,
): Promise<{ role: GroupRole } | null> {
  return db.membership.findFirst({
    where: { groupId, playerId, removedAt: null },
    select: { role: true },
  });
}

// True when the account also belongs to another group; its admins there must not lose control of it.
export async function isSharedAccount(
  db: Prisma.TransactionClient | PrismaClient,
  playerId: string,
  groupId: string,
): Promise<boolean> {
  const others = await db.membership.count({
    where: { playerId, removedAt: null, groupId: { not: groupId } },
  });
  return others > 0;
}
