import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import {
  MatchInlineCard,
  type MatchRow,
} from "@/app/game-day/match-inline-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const baseMatch: MatchRow = {
  id: "m-1",
  matchNumber: 1,
  team1A: "Anna",
  team1B: "Ben",
  team2A: "Carla",
  team2B: "Dirk",
  team1Score: 10,
  team2Score: 8,
  version: 1,
  scoredByName: null,
  scoredAt: null,
};

describe("<MatchInlineCard> scoredBy hint", () => {
  it("renders the hint when scoredByName and scoredAt are provided", () => {
    render(
      <MatchInlineCard
        maxScore={12}
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
    render(<MatchInlineCard maxScore={12} match={baseMatch} />);
    expect(screen.queryByText(/eingetragen von/)).not.toBeInTheDocument();
  });

  it("hides the hint while editing", async () => {
    render(
      <MatchInlineCard
        maxScore={12}
        match={{
          ...baseMatch,
          scoredByName: "Patrick",
          scoredAt: "2026-04-24T17:42:00.000Z",
        }}
      />,
    );
    expect(screen.getByText(/eingetragen von Patrick/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /bearbeiten/i }));
    expect(screen.queryByText(/eingetragen von/)).not.toBeInTheDocument();
  });
});
