import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/auth/group-context";
import { findGroupMembership } from "./active-membership";

export async function renameGroup(i: {
  groupId: string;
  actorId: string;
  name: string;
}): Promise<{ name: string }> {
  const { groupId, actorId } = i;
  const name = i.name.trim();
  return prisma.$transaction(async (tx) => {
    const actor = await findGroupMembership(tx, groupId, actorId);
    if (actor?.role !== "owner") throw new ForbiddenError();
    const group = await tx.group.findUniqueOrThrow({ where: { id: groupId }, select: { name: true } });
    if (group.name === name) return { name };
    await tx.group.update({ where: { id: groupId }, data: { name } });
    await tx.auditLog.create({
      data: {
        actorId,
        groupId,
        action: "group.rename",
        entityType: "Group",
        entityId: groupId,
        payload: { from: group.name, to: name },
      },
    });
    return { name };
  });
}
