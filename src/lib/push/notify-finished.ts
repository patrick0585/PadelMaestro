import { prisma } from "@/lib/db";
import { computeGameDaySummary } from "@/lib/game-day/summary";
import { rankingModeFor } from "@/lib/game-day/competition-rank";
import { listJokersForGameDay } from "@/lib/joker/list";
import { mergeJokersIntoRows } from "@/app/game-day/joker-summary-merge";
import { gameDayFinishedMessage } from "./messages";
import { newGameDayRecipients } from "./recipients";
import { sendToPlayers } from "./send";

type Deps = Parameters<typeof sendToPlayers>[2];

/** One personal push per member when a game day ends; the admin who finished it is skipped. */
export async function notifyGameDayFinished(gameDayId: string, actorId: string, deps?: Deps): Promise<void> {
  try {
    const [day, summary, jokers] = await Promise.all([
      prisma.gameDay.findUnique({ where: { id: gameDayId }, select: { groupId: true, group: { select: { name: true } } } }),
      computeGameDaySummary(gameDayId),
      listJokersForGameDay(gameDayId),
    ]);
    if (!day || !summary || summary.rows.length === 0) return;
    const rows = mergeJokersIntoRows(summary.rows, jokers, rankingModeFor(summary.date));
    const winners = rows.filter((r) => r.rank === 1).map((r) => ({ playerId: r.playerId, name: r.playerName }));
    const winnerPoints = rows[0].points;
    const byPlayer = new Map(rows.map((r) => [r.playerId, r]));

    const recipients = await newGameDayRecipients(gameDayId, actorId);
    const byBody = new Map<string, { title: string; ids: string[] }>();
    for (const id of recipients) {
      const r = byPlayer.get(id);
      const text = gameDayFinishedMessage(
        day.group.name,
        winners,
        winnerPoints,
        r ? { playerId: id, rank: r.rank, points: r.points, joker: r.jokerUsed } : null,
      );
      const entry = byBody.get(text.body) ?? { title: text.title, ids: [] };
      entry.ids.push(id);
      byBody.set(text.body, entry);
    }
    for (const [body, { title, ids }] of byBody) {
      await sendToPlayers(ids, { title, body, gameDayId, groupId: day.groupId }, deps);
    }
  } catch (err) {
    console.error("[push] Nachricht zum Spieltag-Ende fehlgeschlagen", err instanceof Error ? err.message : err);
  }
}
