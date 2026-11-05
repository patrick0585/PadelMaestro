import { describe, it, expect } from "vitest";
import { startTimeMinutes, startTimeSchema, withStartTime } from "@/lib/game-day/start-time";

const isValidStartTime = (s: string) => startTimeSchema.safeParse(s).success;

describe("start time", () => {
  it("akzeptiert HH:MM im 24-Stunden-Format", () => {
    for (const s of ["00:00", "07:05", "18:00", "23:59"]) expect(isValidStartTime(s)).toBe(true);
  });

  it("lehnt alles andere ab", () => {
    for (const s of ["24:00", "7:00", "18:60", "18:00:00", "18.00", "", " 18:00"]) {
      expect(isValidStartTime(s)).toBe(false);
    }
  });

  it("hängt die Uhrzeit an das Datum, wenn gesetzt", () => {
    expect(withStartTime("Do., 12. November", "18:00")).toBe("Do., 12. November · 18:00 Uhr");
    expect(withStartTime("Do., 12. November", null)).toBe("Do., 12. November");
    expect(withStartTime("Do., 12. November", undefined)).toBe("Do., 12. November");
  });

  it("rechnet in Minuten seit Mitternacht", () => {
    expect(startTimeMinutes("18:30")).toBe(18 * 60 + 30);
    expect(startTimeMinutes("00:00")).toBe(0);
  });
});
