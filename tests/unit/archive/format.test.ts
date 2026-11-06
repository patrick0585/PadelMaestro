import { describe, it, expect } from "vitest";
import { dateBlockOf, formatGameDayHeading } from "@/lib/format-date";
import { winnerLineOf } from "@/lib/archive/format";

describe("dateBlockOf", () => {
  it("splits a date into zero-padded day and short month", () => {
    expect(dateBlockOf(new Date("2026-10-09T00:00:00Z"))).toEqual({ day: "09", month: "Okt" });
    expect(dateBlockOf(new Date("2026-03-30T00:00:00Z"))).toEqual({ day: "30", month: "Mär" });
  });
});

describe("dateBlockOf boundaries", () => {
  it("uses UTC, not local time, at the day boundary", () => {
    expect(dateBlockOf(new Date("2026-10-31T23:59:59Z"))).toEqual({ day: "31", month: "Okt" });
    expect(dateBlockOf(new Date("2026-11-01T00:00:00Z"))).toEqual({ day: "01", month: "Nov" });
  });

  it("handles year boundaries and the first and last month", () => {
    expect(dateBlockOf(new Date("2025-12-31T23:59:59Z"))).toEqual({ day: "31", month: "Dez" });
    expect(dateBlockOf(new Date("2026-01-01T00:00:00Z"))).toEqual({ day: "01", month: "Jan" });
  });

  it("handles a leap day", () => {
    expect(dateBlockOf(new Date("2028-02-29T00:00:00Z"))).toEqual({ day: "29", month: "Feb" });
  });
});

describe("winnerLineOf", () => {
  it("joins all players sharing rank 1", () => {
    expect(
      winnerLineOf([
        { playerName: "Timo", points: 12, rank: 1 },
        { playerName: "Jonas", points: 12, rank: 1 },
        { playerName: "Lena", points: 10, rank: 2 },
      ]),
    ).toEqual({ names: "Timo · Jonas", points: 12 });
  });

  it("returns null without a podium", () => {
    expect(winnerLineOf([])).toBeNull();
  });

  it("returns null when nobody holds rank 1", () => {
    expect(winnerLineOf([{ playerName: "Lena", points: 10, rank: 2 }])).toBeNull();
  });

  it("takes points from the first winner and ignores lower ranks", () => {
    expect(
      winnerLineOf([
        { playerName: "Timo", points: 0, rank: 1 },
        { playerName: "Lena", points: 5, rank: 2 },
      ]),
    ).toEqual({ names: "Timo", points: 0 });
  });
});

describe("formatGameDayHeading", () => {
  it("formats weekday, day, long month and year in UTC", () => {
    expect(formatGameDayHeading(new Date("2026-10-30T00:00:00Z"))).toBe("Fr., 30. Oktober 2026");
  });
});
