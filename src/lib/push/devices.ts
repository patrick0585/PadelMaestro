import { prisma } from "@/lib/db";

export const MAX_DEVICES_PER_PLAYER = 10;

export async function registerDevice(i: { playerId: string; token: string }): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.pushDevice.upsert({
      where: { token: i.token },
      create: { token: i.token, playerId: i.playerId, lastSeenAt: now },
      update: { playerId: i.playerId, lastSeenAt: now },
    });
    const stale = await tx.pushDevice.findMany({
      where: { playerId: i.playerId },
      orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
      skip: MAX_DEVICES_PER_PLAYER,
      select: { id: true },
    });
    if (stale.length > 0) {
      await tx.pushDevice.deleteMany({ where: { id: { in: stale.map((d) => d.id) } } });
    }
  });
}

export async function unregisterDevice(i: { playerId: string; token: string }): Promise<void> {
  await prisma.pushDevice.deleteMany({ where: { token: i.token, playerId: i.playerId } });
}

export async function setRemindersEnabled(playerId: string, enabled: boolean): Promise<void> {
  await prisma.player.update({ where: { id: playerId }, data: { pushRemindersEnabled: enabled } });
}
