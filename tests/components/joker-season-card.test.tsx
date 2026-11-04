import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { JokerSeasonCard } from "@/components/joker-season-card";

describe("<JokerSeasonCard>", () => {
  it("renders all indicators and the label for 10 jokers", () => {
    render(<JokerSeasonCard seasonName="2026" jokers={{ total: 10, used: 3, remaining: 7 }} />);
    expect(screen.getAllByLabelText("Joker eingesetzt")).toHaveLength(3);
    expect(screen.getAllByLabelText("Joker verfügbar")).toHaveLength(7);
    expect(screen.getByText("7 Joker verfügbar")).toBeInTheDocument();
    expect(screen.getByText("3 / 10 eingesetzt")).toBeInTheDocument();
  });

  it("wraps the indicators", () => {
    render(<JokerSeasonCard seasonName="2026" jokers={{ total: 10, used: 0, remaining: 10 }} />);
    expect(screen.getAllByLabelText("Joker verfügbar")[0].parentElement).toHaveClass("flex-wrap");
  });

  it("shows the empty label", () => {
    render(<JokerSeasonCard seasonName="2026" jokers={{ total: 2, used: 2, remaining: 0 }} />);
    expect(screen.getByText("Keine Joker mehr verfügbar")).toBeInTheDocument();
  });
});
