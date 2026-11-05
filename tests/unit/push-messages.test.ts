import { describe, it, expect } from "vitest";
import { gameDayFinishedMessage, newGameDayMessage, reminderMessage, reminderTime } from "@/lib/push/messages";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("push messages", () => {
  it("new game day text has weekday and TT.MM.", () => {
    expect(newGameDayMessage("Donnerstagsrunde", d("2026-11-12"))).toEqual({
      title: "Neuer Spieltag",
      body: "Donnerstagsrunde: Do, 12.11. – bist du dabei?",
    });
    expect(newGameDayMessage("G", d("2026-03-01")).body).toBe("G: So, 01.03. – bist du dabei?");
    expect(newGameDayMessage("G", d("2026-11-09")).body).toBe("G: Mo, 09.11. – bist du dabei?");
  });

  it("new game day text nennt den Anpfiff, wenn gesetzt", () => {
    expect(newGameDayMessage("G", d("2026-11-12"), "18:00").body).toBe(
      "G: Do, 12.11. um 18:00 Uhr – bist du dabei?",
    );
  });

  it("reminder texts", () => {
    expect(reminderMessage("day_before", "G")).toEqual({
      title: "Noch nicht abgestimmt",
      body: "G: morgen ist Spieltag – bist du dabei?",
    });
    expect(reminderMessage("same_day", "G").body).toBe("G: heute ist Spieltag – bist du dabei?");
  });

  it("reminder texts mit Anpfiff", () => {
    expect(reminderMessage("day_before", "G", "18:00").body).toBe(
      "G: morgen um 18:00 Uhr ist Spieltag – bist du dabei?",
    );
    expect(reminderMessage("same_day", "G", "09:30").body).toBe(
      "G: heute um 09:30 Uhr ist Spieltag – bist du dabei?",
    );
  });

  it("same_day-Erinnerung kommt spätestens 3 Stunden vor Anpfiff, frühestens 7 Uhr", () => {
    const iso = (s: string, t: string | null) => reminderTime("same_day", d(s), t)?.toISOString();
    expect(iso("2026-12-10", "18:00")).toBe("2026-12-10T13:00:00.000Z");
    expect(iso("2026-12-10", "11:30")).toBe("2026-12-10T07:30:00.000Z");
    expect(iso("2026-12-10", "09:00")).toBe("2026-12-10T06:00:00.000Z");
    expect(iso("2026-07-02", "16:15")).toBe("2026-07-02T11:15:00.000Z");
    expect(reminderTime("day_before", d("2026-12-10"), "09:00")?.toISOString()).toBe("2026-12-09T17:00:00.000Z");
  });

  it("keine same_day-Erinnerung, wenn sie nicht mindestens 1 Stunde vor Anpfiff käme", () => {
    expect(reminderTime("same_day", d("2026-12-10"), "08:00")?.toISOString()).toBe("2026-12-10T06:00:00.000Z");
    expect(reminderTime("same_day", d("2026-12-10"), "07:59")).toBeNull();
    expect(reminderTime("same_day", d("2026-12-10"), "06:00")).toBeNull();
    expect(reminderTime("day_before", d("2026-12-10"), "06:00")?.toISOString()).toBe("2026-12-09T17:00:00.000Z");
  });

  it("früher Anpfiff am Tag der Zeitumstellung", () => {
    expect(reminderTime("same_day", d("2026-10-25"), "11:30")?.toISOString()).toBe("2026-10-25T07:30:00.000Z");
    expect(reminderTime("same_day", d("2027-03-28"), "11:30")?.toISOString()).toBe("2027-03-28T06:30:00.000Z");
  });

  it("reminderTime across DST changes and in winter", () => {
    const iso = (k: "day_before" | "same_day", s: string) => reminderTime(k, d(s))?.toISOString();
    expect(iso("day_before", "2026-10-25")).toBe("2026-10-24T16:00:00.000Z");
    expect(iso("same_day", "2026-10-25")).toBe("2026-10-25T13:00:00.000Z");
    expect(iso("day_before", "2027-03-28")).toBe("2027-03-27T17:00:00.000Z");
    expect(iso("same_day", "2027-03-28")).toBe("2027-03-28T12:00:00.000Z");
    expect(iso("day_before", "2026-12-10")).toBe("2026-12-09T17:00:00.000Z");
    expect(iso("same_day", "2026-12-10")).toBe("2026-12-10T13:00:00.000Z");
    expect(iso("same_day", "2026-07-02")).toBe("2026-07-02T12:00:00.000Z");
  });

  describe("Spieltag beendet", () => {
    const winners = [{ playerId: "a", name: "Anna Vogel" }];
    it("Mitspieler: Sieger und eigener Platz", () => {
      expect(gameDayFinishedMessage("G", winners, 28, { playerId: "p", rank: 4, points: 11, joker: false })).toEqual({
        title: "Spieltag beendet",
        body: "G: Anna gewinnt mit 28 Punkten. Du wirst 4. mit 11.",
      });
    });
    it("Sieger allein und geteilt", () => {
      expect(gameDayFinishedMessage("G", winners, 28, { playerId: "a", rank: 1, points: 28, joker: false }).body).toBe(
        "G: Du gewinnst den Spieltag mit 28 Punkten!",
      );
      const two = [...winners, { playerId: "b", name: "Ben" }];
      expect(gameDayFinishedMessage("G", two, 12, { playerId: "b", rank: 1, points: 12, joker: false }).body).toBe(
        "G: Du gewinnst gemeinsam mit Anna – 12 Punkte!",
      );
      expect(gameDayFinishedMessage("G", two, 12, null).body).toBe("G: Anna und Ben gewinnen mit 12 Punkten.");
      const three = [...two, { playerId: "e", name: "Eva" }];
      expect(gameDayFinishedMessage("G", three, 12, null).body).toBe("G: Anna, Ben und Eva gewinnen mit 12 Punkten.");
    });
    it("Einzahl bei einem Punkt", () => {
      expect(gameDayFinishedMessage("G", winners, 1, { playerId: "j", rank: 2, points: 1, joker: true }).body).toBe(
        "G: Ohne dich: Anna gewinnt mit 1 Punkt. Dein Joker bringt 1 Punkt.",
      );
    });
    it("Joker und nicht dabei", () => {
      expect(gameDayFinishedMessage("G", winners, 28, { playerId: "j", rank: 3, points: 17, joker: true }).body).toBe(
        "G: Ohne dich: Anna gewinnt mit 28 Punkten. Dein Joker bringt 17 Punkte.",
      );
      expect(gameDayFinishedMessage("G", winners, 28, null).body).toBe("G: Anna gewinnt mit 28 Punkten.");
    });
  });
});
