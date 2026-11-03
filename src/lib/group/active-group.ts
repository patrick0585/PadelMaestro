import { prisma } from "@/lib/db";
import type { GroupRole } from "@/lib/auth/roles";

export class NotAMemberError extends Error {
  constructor() {
    super("not an active member of this group");
    this.name = "NotAMemberError";
  }
}

export async function setActiveGroup(i: { playerId: string; groupId: string }): Promise<void> {
  const membership = await prisma.membership.findFirst({
    where: { playerId: i.playerId, groupId: i.groupId, removedAt: null },
    select: { id: true },
  });
  if (!membership) throw new NotAMemberError();
  await prisma.player.update({ where: { id: i.playerId }, data: { activeGroupId: i.groupId } });
}

export async function listMyGroups(
  playerId: string,
): Promise<{ id: string; name: string; role: GroupRole }[]> {
  const rows = await prisma.membership.findMany({
    where: { playerId, removedAt: null },
    select: { role: true, group: { select: { id: true, name: true } } },
    orderBy: { group: { name: "asc" } },
  });
  return rows.map((r) => ({ id: r.group.id, name: r.group.name, role: r.role }));
}
