import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reminderMessage, reminderTime, type ReminderKind } from "./messages";
import { reminderRecipients } from "./recipients";
import { sendToPlayers } from "./send";

type Deps = Parameters<typeof sendToPlayers>[2];

const KINDS: ReminderKind[] = ["day_before", "same_day"];
const DAY_MS = 24 * 60 * 60 * 1000;
const CATCH_UP_MS = 2 * 60 * 60 * 1000;

export async function sendDueReminders(
  now: Date,
  deps?: Deps,
): Promise<{ kind: ReminderKind; gameDayId: string; sent: number }[]> {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = await prisma.gameDay.findMany({
    where: {
      status: "planned",
      date: { gte: new Date(today - DAY_MS), lte: new Date(today + 2 * DAY_MS) },
    },
    select: { id: true, groupId: true, date: true, createdAt: true, group: { select: { name: true } } },
  });

  const results: { kind: ReminderKind; gameDayId: string; sent: number }[] = [];
  for (const day of days) {
    for (const kind of KINDS) {
      const at = reminderTime(kind, day.date).getTime();
      const due = at >= day.createdAt.getTime() && at <= now.getTime() && now.getTime() < at + CATCH_UP_MS;
      if (!due) continue;
      try {
        await prisma.pushReminderSent.create({ data: { gameDayId: day.id, kind } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
      const recipients = await reminderRecipients(day.id);
      const text = reminderMessage(kind, day.group.name);
      const summary = await sendToPlayers(recipients, { ...text, gameDayId: day.id, groupId: day.groupId }, deps);
      results.push({ kind, gameDayId: day.id, sent: summary.sent });
    }
  }
  return results;
}
