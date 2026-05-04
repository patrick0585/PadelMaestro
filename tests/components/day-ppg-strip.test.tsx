import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DayPpgStrip } from "@/components/day-ppg-strip";
import type { DayTrend } from "@/lib/player/season-stats";

function day(overrides: Partial<DayTrend> = {}): DayTrend {
  return {
    gameDayId: "d",
    date: new Date("2026-04-21"),
    ppg: 1.5,
    delta: "flat",
    points: 15,
    matches: 10,
    placement: 3,
    totalPlayers: 6,
    ...overrides,
  };
}

describe("<DayPpgStrip>", () => {
  it("renders one tile per day in newest-first order", () => {
    render(
      <DayPpgStrip
        days={[
          day({ gameDayId: "d1", ppg: 2.3, delta: "up", placement: 1, points: 20, matches: 10 }),
          day({ gameDayId: "d2", ppg: 1, delta: "flat", placement: 4, points: 10, matches: 10 }),
          day({ gameDayId: "d3", ppg: 0.7, delta: "down", placement: 6, points: 4, matches: 6 }),
        ]}
      />,
    );
    const tiles = screen.getAllByRole("listitem");
    expect(tiles).toHaveLength(3);
    expect(tiles[0]).toHaveTextContent("1.");
    expect(tiles[2]).toHaveTextContent("6.");
  });

  it("renders placement, points, matches, PPG and date on every tile", () => {
    render(
      <DayPpgStrip
        days={[
          day({
            gameDayId: "d1",
            date: new Date("2026-04-21"),
            ppg: 1.4,
            placement: 2,
            totalPlayers: 6,
            points: 14,
            matches: 10,
          }),
        ]}
      />,
    );
    const tile = screen.getByRole("listitem");
    expect(tile).toHaveTextContent("21.04.");
    expect(tile).toHaveTextContent("2.");
    expect(tile).toHaveTextContent("v. 6");
    expect(tile).toHaveTextContent("14");
    expect(tile).toHaveTextContent("Pt");
    expect(tile).toHaveTextContent("10");
    expect(tile).toHaveTextContent("Sp");
    expect(tile).toHaveTextContent("1.4 PPG");
  });

  it("highlights 1st place in primary, 2nd/3rd in success, 4th+ as neutral", () => {
    render(
      <DayPpgStrip
        days={[
          day({ gameDayId: "first", placement: 1, totalPlayers: 6 }),
          day({ gameDayId: "podium", placement: 2, totalPlayers: 6 }),
          day({ gameDayId: "fourth", placement: 4, totalPlayers: 6 }),
        ]}
      />,
    );
    const tiles = screen.getAllByRole("listitem");
    // newest-first = first, podium, fourth (input order)
    const [first, podium, fourth] = tiles;
    expect(first.innerHTML).toContain("bg-primary-soft");
    expect(podium.innerHTML).toContain("bg-success-soft");
    expect(fourth.innerHTML).toContain("bg-surface-muted");
  });

  it("renders nothing when the list is empty", () => {
    const { container } = render(<DayPpgStrip days={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("applies trend-specific aria labels", () => {
    render(
      <DayPpgStrip
        days={[
          day({ gameDayId: "d1", delta: "up" }),
          day({ gameDayId: "d2", delta: "down" }),
          day({ gameDayId: "d3", delta: "flat" }),
        ]}
      />,
    );
    expect(screen.getByLabelText(/Verbessert/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Verschlechtert/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Unverändert/i)).toBeInTheDocument();
  });

  it("labels the scrollable list as 'Letzte Spieltage'", () => {
    render(<DayPpgStrip days={[day()]} />);
    expect(screen.getByRole("list", { name: /Letzte Spieltage/i })).toBeInTheDocument();
  });
});
