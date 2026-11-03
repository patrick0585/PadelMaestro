import { prisma } from "@/lib/db";

export async function resetDb(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.jokerUse.deleteMany();
  await prisma.match.deleteMany();
  await prisma.gameDayParticipant.deleteMany();
  await prisma.gameDay.deleteMany();
  await prisma.season.deleteMany();
  await prisma.invitationUse.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.emailToken.deleteMany();
  await prisma.player.deleteMany();
  await prisma.group.deleteMany();
}
