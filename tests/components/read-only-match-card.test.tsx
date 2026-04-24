import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  ReadOnlyMatchCard,
  type ReadOnlyMatch,
} from "@/app/archive/read-only-match-card";

const baseMatch: ReadOnlyMatch = {
  matchNumber: 1,
  team1A: "Anna",
  team1B: "Ben",
  team2A: "Carla",
  team2B: "Dirk",
  team1Score: 10,
  team2Score: 8,
  scoredByName: null,
  scoredAt: null,
};

describe("<ReadOnlyMatchCard> scoredBy hint", () => {
  it("renders the hint when scoredByName and scoredAt are provided", () => {
    render(
      <ReadOnlyMatchCard
        match={{
          ...baseMatch,
          scoredByName: "Patrick",
          scoredAt: "2026-04-24T17:42:00.000Z",
        }}
      />,
    );
    expect(screen.getByText(/eingetragen von Patrick/)).toBeInTheDocument();
  });

  it("does not render the hint when scoredByName is missing", () => {
    render(<ReadOnlyMatchCard match={baseMatch} />);
    expect(screen.queryByText(/eingetragen von/)).not.toBeInTheDocument();
  });
});
