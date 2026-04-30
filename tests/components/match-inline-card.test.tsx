import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import {
  MatchInlineCard,
  type MatchRow,
} from "@/app/game-day/match-inline-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function bumpTeamA() {
  const teamA = screen.getByRole("group", { name: "Team A Score" });
  return userEvent.click(within(teamA).getByRole("button", { name: "Wert erhöhen" }));
}

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

describe("<MatchInlineCard> tie/save guard", () => {
  it("disables Speichern when both scores are 0 (initial state)", async () => {
    render(
      <MatchInlineCard
        maxScore={3}
        match={{ ...baseMatch, team1Score: null, team2Score: null }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /eintragen/i }));
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
  });

  it("re-enables Speichern as soon as the scores diverge", async () => {
    render(
      <MatchInlineCard
        maxScore={3}
        match={{ ...baseMatch, team1Score: null, team2Score: null }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /eintragen/i }));
    const save = screen.getByRole("button", { name: "Speichern" });
    expect(save).toBeDisabled();
    // bump team A from 0 to 1 — scores now diverge, save unlocks
    await bumpTeamA();
    expect(save).not.toBeDisabled();
  });

  it("translates the server's 'Total points must sum to 3' rejection", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Total points must sum to 3 (e.g. 3:0, 2:1, 1:2, 0:3)" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    render(
      <MatchInlineCard
        maxScore={3}
        match={{ ...baseMatch, team1Score: null, team2Score: null }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /eintragen/i }));
    // 1:0 sums to 1, server should reject — but client allows the call.
    await bumpTeamA();
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText(/Summe muss 3 ergeben/)).toBeInTheDocument();
    fetchSpy.mockRestore();
  });

  it("shows the optimistic-locking message on a 409 conflict", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("{}", { status: 409 }),
    );
    render(<MatchInlineCard maxScore={3} match={{ ...baseMatch, team1Score: 1, team2Score: 0 }} />);
    await userEvent.click(screen.getByRole("button", { name: /bearbeiten/i }));
    await bumpTeamA();
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText(/Zwischenzeitlich geändert/)).toBeInTheDocument();
    fetchSpy.mockRestore();
  });
});
