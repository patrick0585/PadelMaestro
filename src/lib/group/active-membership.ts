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
