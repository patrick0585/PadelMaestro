import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { SeasonTrendChart } from "@/components/season-trend-chart";
import { TONE_COLOR } from "@/components/charts/stats-line-chart";

const pl = (playerId: string, name: string, values: number[], points: number[], jokerDays = [false, false]) => ({
  playerId,
  name,
  values,
  points,
  jokerDays,
});

const data = {
  days: [{ date: "2026-04-01T00:00:00.000Z" }, { date: "2026-04-08T00:00:00.000Z" }],
  players: [
    pl("mi", "Michi Maier", [1, 1], [9, 20]),
    pl("me", "Patrick", [2, 2], [8, 15.6], [false, true]),
    pl("jo", "Jonas", [3, 3], [4, 9]),
  ],
  totalPlayers: 3,
};

const lineColors = (container: HTMLElement) =>
  new Set([...container.querySelectorAll("line[stroke]")].map((l) => l.getAttribute("stroke")));

describe("SeasonTrendChart", () => {
  it("colours me and the leader, greys the rest and dashes joker segments", () => {
    const { container } = render(<SeasonTrendChart data={data} currentPlayerId="me" leaderId="mi" />);
    const colors = lineColors(container);
    expect(colors).toContain(TONE_COLOR.me);
    expect(colors).toContain(TONE_COLOR.lead);
    expect(colors).toContain(TONE_COLOR.rest);
    expect(container.querySelector(`line[stroke="${TONE_COLOR.me}"][stroke-dasharray]`)).not.toBeNull();
    expect(screen.getByText("Michi · Platz 1")).toBeInTheDocument();
    expect(screen.getByText(/Joker-Tag/)).toBeInTheDocument();
  });

  it("switches between place and points", async () => {
    render(<SeasonTrendChart data={data} currentPlayerId="me" leaderId="mi" />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/Platz/);
    await userEvent.click(screen.getByRole("button", { name: "Punkte" }));
    expect(screen.getByRole("button", { name: "Punkte" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img")).toHaveAccessibleName(/Punkte/);
  });

  it("highlights a picked player for comparison and toggles back", async () => {
    const { container } = render(<SeasonTrendChart data={data} currentPlayerId="me" leaderId="mi" />);
    const jonas = screen.getByRole("button", { name: "Jonas" });
    await userEvent.click(jonas);
    expect(jonas).toHaveAttribute("aria-pressed", "true");
    expect(lineColors(container)).toContain(TONE_COLOR.pick);
    await userEvent.click(jonas);
    expect(lineColors(container)).not.toContain(TONE_COLOR.pick);
  });
});
