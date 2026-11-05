import { prisma } from "@/lib/db";
import { newGameDayMessage } from "./messages";
import { newGameDayRecipients } from "./recipients";
import { sendToPlayers } from "./send";

type Deps = Parameters<typeof sendToPlayers>[2];

export async function notifyNewGameDay(gameDayId: string, actorId: string, deps?: Deps): Promise<void> {
  try {
    const day = await prisma.gameDay.findUnique({
      where: { id: gameDayId },
      select: { id: true, groupId: true, date: true, startTime: true, group: { select: { name: true } } },
    });
    if (!day) return;
    const recipients = await newGameDayRecipients(day.id, actorId);
    const text = newGameDayMessage(day.group.name, day.date, day.startTime);
    await sendToPlayers(recipients, { ...text, gameDayId: day.id, groupId: day.groupId }, deps);
  } catch (err) {
    console.error("[push] Nachricht zum neuen Spieltag fehlgeschlagen", err instanceof Error ? err.message : err);
  }
}
