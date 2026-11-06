import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/auth/group-context";
import { verifyPassword } from "@/lib/auth/hash";
import { WrongPasswordError } from "@/lib/account/errors";
import { assertFreshAppleProof } from "@/lib/auth/apple/reauth";
import type { AppleIdentity } from "@/lib/auth/apple/verify";
import { findGroupMembership } from "./active-membership";

export { WrongPasswordError } from "@/lib/account/errors";

export class NameMismatchError extends Error {
  constructor() {
    super("group name does not match");
    this.name = "NameMismatchError";
  }
}

export async function deleteGroup(i: {
  groupId: string;
  actorId: string;
  name: string;
  password?: string;
  /** Required for Apple-only accounts: a fresh identity token for their own Apple ID. */
  appleProof?: AppleIdentity;
  now?: Date;
}): Promise<void> {
  const { groupId, actorId } = i;
  const actor = await findGroupMembership(prisma, groupId, actorId);
  if (actor?.role !== "owner") throw new ForbiddenError();
  const group = await prisma.group.findUniqueOrThrow({
    where: { id: groupId },
    select: { name: true, slug: true },
  });
  if (i.name !== group.name) throw new NameMismatchError();
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: actorId },
    select: { passwordHash: true, appleSub: true },
  });
  if (player.passwordHash) {
    if (!i.password || !(await verifyPassword(i.password, player.passwordHash))) throw new WrongPasswordError();
  } else if (!player.appleSub) {
    throw new WrongPasswordError();
  } else {
    assertFreshAppleProof(player.appleSub, i.appleProof, i.now);
  }

  await prisma.$transaction(async (tx) => {
    // Re-checked under the row lock: a concurrent transfer may have made the actor admin.
    // Same-value write, because Prisma sends no UPDATE at all for `data: {}`.
    const stillOwner = await tx.membership.updateMany({
      where: { groupId, playerId: actorId, role: "owner", removedAt: null },
      data: { role: "owner" },
    });
    if (stillOwner.count !== 1) throw new ForbiddenError();
    const [members, gameDays] = await Promise.all([
      tx.membership.count({ where: { groupId, removedAt: null } }),
      tx.gameDay.count({ where: { groupId } }),
    ]);
    await tx.auditLog.create({
      data: {
        actorId,
        groupId: null,
        action: "group.delete",
        entityType: "Group",
        entityId: groupId,
        payload: { name: group.name, slug: group.slug, members, gameDays },
      },
    });
    // FK order; Player.activeGroupId and InvitationUse.foundedGroupId are SetNull.
    await tx.jokerUse.deleteMany({ where: { gameDay: { groupId } } });
    await tx.match.deleteMany({ where: { gameDay: { groupId } } });
    await tx.gameDayParticipant.deleteMany({ where: { gameDay: { groupId } } });
    await tx.gameDay.deleteMany({ where: { groupId } });
    await tx.season.deleteMany({ where: { groupId } });
    await tx.invitationUse.deleteMany({ where: { invitation: { groupId } } });
    await tx.invitation.deleteMany({ where: { groupId } });
    await tx.membership.deleteMany({ where: { groupId } });
    await tx.auditLog.deleteMany({ where: { groupId } });
    await tx.group.delete({ where: { id: groupId } });
  });
}
