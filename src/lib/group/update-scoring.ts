import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/auth/group-context";
import { isAdminRole } from "@/lib/auth/roles";
import type { PlayerCountKey, ScoringRule, ScoringRules } from "@/lib/scoring/rule";
import { findGroupMembership } from "./active-membership";
import { getGroupScoring } from "./scoring";

export async function updateGroupScoring(i: {
  groupId: string;
  actorId: string;
  playerCount: PlayerCountKey;
  rule: ScoringRule;
}): Promise<ScoringRules> {
  const { groupId, actorId, playerCount, rule } = i;
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Group" WHERE id = ${groupId} FOR UPDATE`;
    const actor = await findGroupMembership(tx, groupId, actorId);
    if (!isAdminRole(actor?.role)) throw new ForbiddenError();

    const current = await getGroupScoring(groupId, tx);
    const next: ScoringRules = { ...current, [playerCount]: rule };
    await tx.group.update({ where: { id: groupId }, data: { scoring: next } });
    await tx.auditLog.create({
      data: {
        actorId,
        groupId,
        action: "group.scoring_update",
        entityType: "Group",
        entityId: groupId,
        payload: { playerCount: Number(playerCount), before: current[playerCount], after: rule },
      },
    });
    return next;
  });
}
