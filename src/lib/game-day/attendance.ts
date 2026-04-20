import { prisma } from "@/lib/db";
import type { AttendanceStatus } from "@prisma/client";

export async function setAttendance(
  gameDayId: string,
  playerId: string,
  attendance: AttendanceStatus,
) {
  const day = await prisma.gameDay.findUniqueOrThrow({ where: { id: gameDayId } });
  if (day.status !== "planned") {
    throw new Error("Game day is locked; attendance can no longer be changed");
  }

  return prisma.gameDayParticipant.update({
    where: { gameDayId_playerId: { gameDayId, playerId } },
    data: { attendance, respondedAt: new Date() },
  });
}
