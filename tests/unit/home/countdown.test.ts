import { describe, it, expect } from "vitest";
import { countdownLabel, daysUntil } from "@/lib/home/countdown";

const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe("countdown", () => {
  it("zählt Berliner Kalendertage", () => {
    // 23:30 Berlin am 11.11. (Winter, UTC+1) ist noch der 11.
    expect(daysUntil(day("2026-11-12"), new Date("2026-11-11T22:30:00Z"))).toBe(1);
    // 00:30 Berlin am 12.11. ist schon der 12.
    expect(daysUntil(day("2026-11-12"), new Date("2026-11-11T23:30:00Z"))).toBe(0);
    expect(daysUntil(day("2026-11-20"), new Date("2026-11-12T10:00:00Z"))).toBe(8);
  });

  it("über die Zeitumstellung", () => {
    expect(daysUntil(day("2027-03-29"), new Date("2027-03-27T12:00:00Z"))).toBe(2);
  });

  it("Sommerzeit: Mitternacht Berlin", () => {
    expect(daysUntil(day("2026-07-11"), new Date("2026-07-10T21:59:59Z"))).toBe(1);
    expect(daysUntil(day("2026-07-11"), new Date("2026-07-10T22:00:00Z"))).toBe(0);
  });

  it("Beschriftung", () => {
    expect(countdownLabel(0)).toBe("heute");
    expect(countdownLabel(1)).toBe("morgen");
    expect(countdownLabel(8)).toBe("in 8 Tagen");
    expect(countdownLabel(-1)).toBe("überfällig");
  });
});
