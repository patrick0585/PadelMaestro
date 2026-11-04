import { prisma } from "@/lib/db";

export async function registerDevice(i: { playerId: string; token: string }): Promise<void> {
  const now = new Date();
  await prisma.pushDevice.upsert({
    where: { token: i.token },
    create: { token: i.token, playerId: i.playerId, lastSeenAt: now },
    update: { playerId: i.playerId, lastSeenAt: now },
  });
}

export async function unregisterDevice(i: { playerId: string; token: string }): Promise<void> {
  await prisma.pushDevice.deleteMany({ where: { token: i.token, playerId: i.playerId } });
}

export async function setRemindersEnabled(playerId: string, enabled: boolean): Promise<void> {
  await prisma.player.update({ where: { id: playerId }, data: { pushRemindersEnabled: enabled } });
}
