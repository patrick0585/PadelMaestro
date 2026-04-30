import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import {
  MatchInlineCard,
  germanInvalidReason,
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

  it("re-disables Speichern when both scores collide again after a bump", async () => {
    render(<MatchInlineCard maxScore={3} match={{ ...baseMatch, team1Score: null, team2Score: null }} />);
    await userEvent.click(screen.getByRole("button", { name: /eintragen/i }));
    const save = screen.getByRole("button", { name: "Speichern" });
    expect(save).toBeDisabled();
    await bumpTeamA();
    expect(save).not.toBeDisabled();
    const teamB = screen.getByRole("group", { name: "Team B Score" });
    await userEvent.click(within(teamB).getByRole("button", { name: "Wert erhöhen" }));
    expect(save).toBeDisabled();
  });

  it("shows the forbidden copy on a 403 response", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("{}", { status: 403 }),
    );
    render(<MatchInlineCard maxScore={3} match={{ ...baseMatch, team1Score: 1, team2Score: 0 }} />);
    await userEvent.click(screen.getByRole("button", { name: /bearbeiten/i }));
    await bumpTeamA();
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText(/Du darfst diesen Score nicht eintragen/)).toBeInTheDocument();
    fetchSpy.mockRestore();
  });

  it("falls back to the generic copy when a 400 has no parseable body", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("upstream went sideways", { status: 400 }),
    );
    render(<MatchInlineCard maxScore={3} match={{ ...baseMatch, team1Score: 1, team2Score: 0 }} />);
    await userEvent.click(screen.getByRole("button", { name: /bearbeiten/i }));
    await bumpTeamA();
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Ungültiges Ergebnis.")).toBeInTheDocument();
    fetchSpy.mockRestore();
  });
});

describe("germanInvalidReason", () => {
  it("translates the tie rejection", () => {
    expect(germanInvalidReason("Ties are not allowed")).toBe("Unentschieden ist nicht erlaubt.");
  });

  it("translates the sum-to-3 rejection", () => {
    expect(
      germanInvalidReason("Total points must sum to 3 (e.g. 3:0, 2:1, 1:2, 0:3)"),
    ).toBe("Summe muss 3 ergeben (z. B. 3:0, 2:1, 1:2, 0:3).");
  });

  it("translates the non-negative-integer rejection", () => {
    expect(germanInvalidReason("Scores must be non-negative integers")).toBe(
      "Nur ganze Zahlen ≥ 0 erlaubt.",
    );
  });

  it("translates the tennis-set 'winner must reach 6' rejection", () => {
    expect(germanInvalidReason("Winner must reach at least 6")).toBe(
      "Der Sieger muss mindestens 6 erreichen.",
    );
  });

  it("translates both 2-game-lead variants the server emits", () => {
    expect(germanInvalidReason("At 6:5 play continues until a 2-game lead")).toBe(
      "Mindestens 2 Spiele Vorsprung nötig.",
    );
    expect(germanInvalidReason("After 6:6 the match ends only on a 2-game lead")).toBe(
      "Mindestens 2 Spiele Vorsprung nötig.",
    );
  });

  it("falls back to the generic copy on an unknown reason", () => {
    expect(germanInvalidReason("future server error wording")).toBe("Ungültiges Ergebnis.");
  });
});
