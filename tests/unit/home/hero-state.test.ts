import { describe, it, expect } from "vitest";
import { buildHeroState } from "@/lib/home/hero-state";

const part = (playerId: string, attendance: string) => ({
  playerId,
  attendance,
  player: { name: playerId.toUpperCase(), avatarVersion: 0 },
});
const day = {
  id: "d1",
  date: new Date("2026-11-12T00:00:00Z"),
  startTime: "19:30",
  participants: [part("a", "confirmed"), part("b", "pending"), part("me", "joker"), part("c", "declined")],
};
const extra = { jokersRemaining: 1, jokersTotal: 2, jokerGamesCredited: 15, ppgSnapshot: 1.7, now: new Date("2026-11-05T10:00:00Z") };

describe("buildHeroState", () => {
  it("Mitglied mit Datum, Countdown, Zählern und Pips", () => {
    const s = buildHeroState(day, "me", extra);
    expect(s).toMatchObject({
      kind: "member",
      gameDayId: "d1",
      weekday: "Donnerstag",
      dateShort: "12.11.",
      startTime: "19:30",
      countdown: "in 7 Tagen",
      confirmed: 1,
      pending: 1,
      total: 4,
      attendance: "joker",
      jokersRemaining: 1,
      ppgSnapshot: 1.7,
    });
    expect(s.pips.map((p) => p.playerId)).toEqual(["a"]);
  });

  it("nicht im Spieltag: not-member, unbekannte Zusage wird zu pending", () => {
    expect(buildHeroState(day, "x", extra).kind).toBe("not-member");
    const odd = { ...day, participants: [part("me", "weird")] };
    expect(buildHeroState(odd, "me", extra)).toMatchObject({ kind: "member", attendance: "pending" });
  });
});
