import { prisma } from "@/lib/db";

export async function resetDb(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.jokerUse.deleteMany();
  await prisma.match.deleteMany();
  await prisma.gameDayParticipant.deleteMany();
  await prisma.gameDay.deleteMany();
  await prisma.season.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.player.deleteMany();
}
