import { render, screen } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { SeasonTrendChart } from "@/components/season-trend-chart";

describe("SeasonTrendChart Datumsachse", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(["UTC", "America/New_York", "Asia/Tokyo"])("zeigt Spieltagsdaten wie in Deutschland, auch wenn TZ=%s", (tz) => {
    vi.stubEnv("TZ", tz);
    const data = {
      days: [{ date: "2026-04-01T00:00:00.000Z" }, { date: "2026-04-08T00:00:00.000Z" }],
      players: [{ playerId: "me", name: "Patrick", values: [1, 1], points: [3, 6], jokerDays: [false, false] }],
      totalPlayers: 1,
    };
    render(<SeasonTrendChart data={data} currentPlayerId="me" leaderId={null} />);
    expect(screen.getAllByText("01.04.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("08.04.").length).toBeGreaterThan(0);
  });
});
