import { prisma } from "@/lib/db";

export class PlayerNotFoundError extends Error {
  constructor(email: string) {
    super(`no player with email ${email}`);
    this.name = "PlayerNotFoundError";
  }
}

export class DeletedPlayerError extends Error {
  constructor(email: string) {
    super(`player ${email} is deleted`);
    this.name = "DeletedPlayerError";
  }
}

export async function setGroupOwner(args: {
  email: string;
  groupId: string;
}): Promise<{ newOwnerId: string; previousOwnerId: string | null }> {
  const { email, groupId } = args;
  return prisma.$transaction(async (tx) => {
    const player = await tx.player.findUnique({ where: { email } });
    if (!player) throw new PlayerNotFoundError(email);
    if (player.deletedAt) throw new DeletedPlayerError(email);

    const previous = await tx.membership.findFirst({
      where: { groupId, role: "owner", playerId: { not: player.id } },
    });
    if (previous) {
      await tx.membership.update({
        where: { id: previous.id },
        data: { role: "admin" },
      });
    }

    await tx.membership.upsert({
      where: { groupId_playerId: { groupId, playerId: player.id } },
      create: { groupId, playerId: player.id, role: "owner" },
      update: { role: "owner", removedAt: null },
    });

    await tx.player.update({ where: { id: player.id }, data: { isAdmin: true } });

    return { newOwnerId: player.id, previousOwnerId: previous?.playerId ?? null };
  });
}
