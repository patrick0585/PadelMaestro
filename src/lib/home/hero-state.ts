import type { HeroState } from "@/app/dashboard-hero";
import { countdownLabel, daysUntil } from "./countdown";

interface HeroDay {
  id: string;
  date: Date;
  startTime: string | null;
  participants: { playerId: string; attendance: string; player: { name: string; avatarVersion: number } }[];
}

interface HeroExtra {
  jokersRemaining: number;
  jokersTotal: number;
  jokerGamesCredited: number;
  ppgSnapshot: number | null;
  now: Date;
}

export const weekdayOf = (d: Date) => d.toLocaleDateString("de-DE", { weekday: "long", timeZone: "UTC" });
export const dateShortOf = (d: Date) =>
  d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

/** Ticket state for a planned game day, shared by the home and game-day pages. */
export function buildHeroState(day: HeroDay, meId: string, extra: HeroExtra): HeroState {
  const confirmed = day.participants.filter((p) => p.attendance === "confirmed");
  const base = {
    gameDayId: day.id,
    weekday: weekdayOf(day.date),
    dateShort: dateShortOf(day.date),
    startTime: day.startTime,
    countdown: countdownLabel(daysUntil(day.date, extra.now)),
    confirmed: confirmed.length,
    pending: day.participants.filter((p) => p.attendance === "pending").length,
    total: day.participants.length,
    pips: confirmed.map((p) => ({ playerId: p.playerId, name: p.player.name, avatarVersion: p.player.avatarVersion })),
  };
  const mine = day.participants.find((p) => p.playerId === meId);
  if (!mine) return { kind: "not-member", ...base };
  const a = mine.attendance;
  return {
    kind: "member",
    ...base,
    attendance: a === "confirmed" || a === "declined" || a === "joker" ? a : "pending",
    jokersRemaining: extra.jokersRemaining,
    jokersTotal: extra.jokersTotal,
    jokerGamesCredited: extra.jokerGamesCredited,
    ppgSnapshot: extra.ppgSnapshot,
  };
}
