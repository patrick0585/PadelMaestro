import type { Prisma } from "@prisma/client";

export async function addToPlannedGameDays(
  tx: Prisma.TransactionClient,
  groupId: string,
  playerId: string,
): Promise<void> {
  const plannedDays = await tx.gameDay.findMany({
    where: { status: "planned", groupId },
    select: { id: true },
  });
  if (plannedDays.length > 0) {
    await tx.gameDayParticipant.createMany({
      data: plannedDays.map((d) => ({ gameDayId: d.id, playerId })),
      skipDuplicates: true,
    });
  }
}

export async function joinGroup(
  tx: Prisma.TransactionClient,
  i: { groupId: string; playerId: string; now?: Date },
): Promise<{ outcome: "joined" | "reactivated" | "already_member" }> {
  const now = i.now ?? new Date();
  const existing = await tx.membership.findUnique({
    where: { groupId_playerId: { groupId: i.groupId, playerId: i.playerId } },
  });
  if (existing && existing.removedAt === null) return { outcome: "already_member" };

  if (existing) {
    await tx.membership.update({
      where: { id: existing.id },
      data: { removedAt: null, role: "member", joinedAt: now },
    });
  } else {
    await tx.membership.create({
      data: { groupId: i.groupId, playerId: i.playerId, role: "member", joinedAt: now },
    });
  }
  await addToPlannedGameDays(tx, i.groupId, i.playerId);
  return { outcome: existing ? "reactivated" : "joined" };
}
