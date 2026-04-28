import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PrintSheet } from "@/app/game-day/print/print-sheet";

const baseMatches = [
  { id: "m1", matchNumber: 1, team1A: "Anna", team1B: "Ben", team2A: "Carl", team2B: "Dora" },
  { id: "m2", matchNumber: 2, team1A: "Anna", team1B: "Carl", team2A: "Ben", team2B: "Dora" },
];

describe("<PrintSheet>", () => {
  it("renders header, roster count and max score", () => {
    render(
      <PrintSheet
        dateText="Dienstag, 28. April 2026"
        status="in_progress"
        maxScore={12}
        playing={["Anna", "Ben", "Carl", "Dora"]}
        joker={[]}
        matches={baseMatches}
      />,
    );
    expect(screen.getByText("Dienstag, 28. April 2026")).toBeInTheDocument();
    expect(screen.getByText(/4 Spieler · 2 Matches · max 12 Punkte/)).toBeInTheDocument();
    expect(screen.getByText("Dabei (4)")).toBeInTheDocument();
  });

  it("renders one row per match with both team rosters and empty score boxes", () => {
    render(
      <PrintSheet
        dateText="Dienstag"
        status="in_progress"
        maxScore={12}
        playing={["Anna", "Ben", "Carl", "Dora"]}
        joker={[]}
        matches={baseMatches}
      />,
    );
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3);
    const m1 = rows[1];
    expect(within(m1).getByText("Anna")).toBeInTheDocument();
    expect(within(m1).getByText("Ben")).toBeInTheDocument();
    expect(within(m1).getByText("Carl")).toBeInTheDocument();
    expect(within(m1).getByText("Dora")).toBeInTheDocument();
    expect(screen.getByTestId("score-box-team1-1")).toBeInTheDocument();
    expect(screen.getByTestId("score-box-team2-1")).toBeInTheDocument();
    expect(screen.getByTestId("score-box-team1-2")).toBeInTheDocument();
    expect(screen.getByTestId("score-box-team2-2")).toBeInTheDocument();
  });

  it("shows the Joker section only when at least one player has joker attendance", () => {
    const { rerender } = render(
      <PrintSheet
        dateText="Dienstag"
        status="in_progress"
        maxScore={12}
        playing={["Anna", "Ben", "Carl", "Dora"]}
        joker={[]}
        matches={baseMatches}
      />,
    );
    expect(screen.queryByText(/^Joker \(/)).not.toBeInTheDocument();

    rerender(
      <PrintSheet
        dateText="Dienstag"
        status="in_progress"
        maxScore={12}
        playing={["Anna", "Ben", "Carl", "Dora"]}
        joker={["Werner"]}
        matches={baseMatches}
      />,
    );
    expect(screen.getByText("Joker (1)")).toBeInTheDocument();
    expect(screen.getByText("Werner")).toBeInTheDocument();
  });

  it("shows the empty-matches hint when there are no matches yet", () => {
    render(
      <PrintSheet
        dateText="Dienstag"
        status="planned"
        maxScore={12}
        playing={["Anna"]}
        joker={[]}
        matches={[]}
      />,
    );
    expect(
      screen.getByText(/Matches sind noch nicht erstellt/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
