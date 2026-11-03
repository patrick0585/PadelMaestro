import { prisma } from "@/lib/db";
import { countOtherAdmins, findGroupMembership } from "@/lib/group/active-membership";
import { ActiveParticipationError } from "@/lib/players/delete";
import { LastAdminError, OwnerProtectedError, PlayerNotFoundError } from "@/lib/players/errors";

export async function leaveGroup(input: { groupId: string; playerId: string }): Promise<void> {
  const { groupId, playerId } = input;
  await prisma.$transaction(async (tx) => {
    const membership = await findGroupMembership(tx, groupId, playerId);
    if (!membership) throw new PlayerNotFoundError(playerId);
    if (membership.role === "owner") throw new OwnerProtectedError();
    if (membership.role === "admin" && (await countOtherAdmins(tx, groupId, playerId)) === 0) {
      throw new LastAdminError();
    }

    const activeParticipation = await tx.gameDayParticipant.findFirst({
      where: {
        playerId,
        attendance: { in: ["confirmed", "joker"] },
        gameDay: { groupId, status: { in: ["planned", "in_progress"] } },
      },
      select: { id: true },
    });
    if (activeParticipation) throw new ActiveParticipationError();

    // Guarded against a concurrent ownership transfer promoting this member.
    const removed = await tx.membership.updateMany({
      where: { groupId, playerId, removedAt: null, role: { not: "owner" } },
      data: { removedAt: new Date() },
    });
    if (removed.count !== 1) {
      const current = await findGroupMembership(tx, groupId, playerId);
      if (current?.role === "owner") throw new OwnerProtectedError();
      throw new PlayerNotFoundError(playerId);
    }

    await tx.player.updateMany({
      where: { id: playerId, activeGroupId: groupId },
      data: { activeGroupId: null },
    });

    await tx.auditLog.create({
      data: {
        actorId: playerId,
        groupId,
        action: "membership.leave",
        entityType: "Group",
        entityId: groupId,
        payload: { role: membership.role },
      },
    });
  });
}
