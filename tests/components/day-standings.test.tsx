import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DayStandings } from "@/app/game-day/finished-summary";
import type { DisplayRow } from "@/app/game-day/joker-summary-merge";

const row = (playerId: string, rank: number, points: number, over: Partial<DisplayRow> = {}): DisplayRow => ({
  playerId,
  playerName: playerId,
  avatarVersion: 0,
  points,
  matches: 10,
  jokerUsed: false,
  rank,
  ...over,
});

describe("DayStandings", () => {
  it("Treppchen mit geteiltem Platz, Rest als Liste, eigene Zeile markiert", () => {
    render(
      <DayStandings
        rows={[row("Patrick", 1, 28), row("Daniel", 2, 16), row("Anna", 3, 12), row("Eva", 3, 12), row("Ben", 4, 11), row("Clara", 4, 11, { jokerUsed: true })]}
        meId="Ben"
        scoredMatchCount={15}
        totalMatchCount={15}
      />,
    );
    expect(screen.getByText("Tagesranking · 15 / 15 gewertet")).toBeInTheDocument();
    const podium = within(screen.getByRole("list", { name: "Podium" })).getAllByRole("listitem");
    expect(podium).toHaveLength(3);
    expect(podium[0]).toHaveTextContent("Patrick");
    expect(podium[0].className).toContain("col-start-2");
    expect(podium[2]).toHaveTextContent("AnnaEva");
    expect(podium[2]).toHaveTextContent("geteilt");
    expect(within(podium[2]).getByRole("img", { name: "Geteilter Platz 3" })).toBeInTheDocument();

    const rest = within(screen.getByRole("list", { name: "Weitere Plätze" })).getAllByRole("listitem");
    expect(rest).toHaveLength(2);
    expect(rest[0]).toHaveAttribute("aria-current", "true");
    expect(rest[1]).toHaveTextContent("Joker");
  });

  it("eigener Platz auf dem Treppchen ist umrandet", () => {
    render(<DayStandings rows={[row("Patrick", 1, 28), row("Daniel", 2, 16)]} meId="Patrick" scoredMatchCount={3} totalMatchCount={3} />);
    const podium = within(screen.getByRole("list", { name: "Podium" })).getAllByRole("listitem");
    expect(podium[0]).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("list", { name: "Weitere Plätze" })).not.toBeInTheDocument();
  });
});
