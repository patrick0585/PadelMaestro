import { describe, it, expect } from "vitest";
import { newGameDayMessage, reminderMessage, reminderTime } from "@/lib/push/messages";

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

  it("reminder texts", () => {
    expect(reminderMessage("day_before", "G")).toEqual({
      title: "Noch nicht abgestimmt",
      body: "G: morgen ist Spieltag – bist du dabei?",
    });
    expect(reminderMessage("same_day", "G").body).toBe("G: heute um 18 Uhr ist Spieltag – bist du dabei?");
  });

  it("reminderTime across DST changes and in winter", () => {
    const iso = (k: "day_before" | "same_day", s: string) => reminderTime(k, d(s)).toISOString();
    expect(iso("day_before", "2026-10-25")).toBe("2026-10-24T16:00:00.000Z");
    expect(iso("same_day", "2026-10-25")).toBe("2026-10-25T13:00:00.000Z");
    expect(iso("day_before", "2027-03-28")).toBe("2027-03-27T17:00:00.000Z");
    expect(iso("same_day", "2027-03-28")).toBe("2027-03-28T12:00:00.000Z");
    expect(iso("day_before", "2026-12-10")).toBe("2026-12-09T17:00:00.000Z");
    expect(iso("same_day", "2026-12-10")).toBe("2026-12-10T13:00:00.000Z");
    expect(iso("same_day", "2026-07-02")).toBe("2026-07-02T12:00:00.000Z");
  });
});
