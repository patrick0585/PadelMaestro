import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/auth/group-context";
import { isAdminRole } from "@/lib/auth/roles";
import { findGroupMembership } from "./active-membership";
import { getGroupRules, type GroupRules } from "./rules";

export class RulesBelowUsedError extends Error {
  constructor(public readonly minimum: number) {
    super(`jokersPerSeason must be at least ${minimum}`);
    this.name = "RulesBelowUsedError";
  }
}

export async function updateGroupRules(i: {
  groupId: string;
  actorId: string;
  rules: GroupRules;
}): Promise<GroupRules> {
  const { groupId, actorId, rules } = i;
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Group" WHERE id = ${groupId} FOR UPDATE`;
    const actor = await findGroupMembership(tx, groupId, actorId);
    if (!isAdminRole(actor?.role)) throw new ForbiddenError();

    const season = await tx.season.findFirst({
      where: { groupId, isActive: true },
      select: { id: true },
    });
    let minimum = 0;
    if (season) {
      const used = await tx.jokerUse.groupBy({
        by: ["playerId"],
        where: {
          seasonId: season.id,
          player: { memberships: { some: { groupId, removedAt: null } } },
        },
        _count: { _all: true },
      });
      minimum = Math.max(0, ...used.map((u) => u._count._all));
    }
    if (rules.jokersPerSeason < minimum) throw new RulesBelowUsedError(minimum);

    const before = await getGroupRules(groupId, tx);
    const after: GroupRules = {
      jokersPerSeason: rules.jokersPerSeason,
      jokerGamesCredited: rules.jokerGamesCredited,
    };
    await tx.group.update({ where: { id: groupId }, data: after });
    await tx.auditLog.create({
      data: {
        actorId,
        groupId,
        action: "group.rules_update",
        entityType: "Group",
        entityId: groupId,
        payload: { before, after },
      },
    });
    return after;
  });
}
