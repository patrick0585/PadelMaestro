import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DayLiveBanner } from "@/app/game-day/day-live-banner";
import type { DayLiveStandingsRow } from "@/lib/game-day/live-standings";

function row(overrides: Partial<DayLiveStandingsRow>): DayLiveStandingsRow {
  return {
    playerId: "p1",
    playerName: "Anna",
    avatarVersion: 0,
    rank: 1,
    previousRank: null,
    points: 0,
    matches: 0,
    ...overrides,
  };
}

function liOf(name: string) {
  const li = screen.getByText(name).closest("li");
  if (!li) throw new Error(`no row for ${name}`);
  return within(li);
}

describe("<DayLiveBanner>", () => {
  it("renders nothing when no match has been scored yet", () => {
    const { container } = render(
      <DayLiveBanner
        rows={[]}
        scoredMatchCount={0}
        totalMatchCount={16}
        hasPreviousState={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the scored / total counter and renders all players", () => {
    render(
      <DayLiveBanner
        rows={[
          row({ playerId: "a", playerName: "Anna", rank: 1, points: 24, matches: 4 }),
          row({ playerId: "b", playerName: "Ben", rank: 2, points: 18, matches: 4 }),
          row({ playerId: "c", playerName: "Carl", rank: 3, points: 16, matches: 4 }),
          row({ playerId: "d", playerName: "Dora", rank: 4, points: 12, matches: 4 }),
          row({ playerId: "e", playerName: "Eric", rank: 5, points: 6, matches: 2 }),
        ]}
        scoredMatchCount={8}
        totalMatchCount={16}
        hasPreviousState={false}
      />,
    );
    expect(screen.getByText("8 / 16 Matches gewertet")).toBeInTheDocument();
    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText("Ben")).toBeInTheDocument();
    expect(screen.getByText("Carl")).toBeInTheDocument();
    expect(screen.getByText("Dora")).toBeInTheDocument();
    expect(screen.getByText("Eric")).toBeInTheDocument();
  });

  it("shows medal emoji for ranks 1-3 and a number from rank 4 on", () => {
    render(
      <DayLiveBanner
        rows={[
          row({ playerId: "a", playerName: "Anna", rank: 1, points: 24, matches: 4 }),
          row({ playerId: "b", playerName: "Ben", rank: 2, points: 18, matches: 4 }),
          row({ playerId: "c", playerName: "Carl", rank: 3, points: 16, matches: 4 }),
          row({ playerId: "d", playerName: "Dora", rank: 4, points: 12, matches: 4 }),
        ]}
        scoredMatchCount={8}
        totalMatchCount={16}
        hasPreviousState={false}
      />,
    );
    expect(screen.getByLabelText("Platz 1")).toHaveTextContent("🥇");
    expect(screen.getByLabelText("Platz 2")).toHaveTextContent("🥈");
    expect(screen.getByLabelText("Platz 3")).toHaveTextContent("🥉");
    expect(liOf("Dora").getByText("4")).toBeInTheDocument();
  });

  it("shows no movement arrows when there is no previous state", () => {
    render(
      <DayLiveBanner
        rows={[
          row({ playerId: "a", playerName: "Anna", rank: 1, previousRank: null, points: 10 }),
          row({ playerId: "b", playerName: "Ben", rank: 2, previousRank: null, points: 5 }),
        ]}
        scoredMatchCount={1}
        totalMatchCount={16}
        hasPreviousState={false}
      />,
    );
    expect(screen.queryByLabelText(/nach oben/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/nach unten/)).not.toBeInTheDocument();
  });

  it("shows an up arrow when the player rose in the standings", () => {
    render(
      <DayLiveBanner
        rows={[row({ playerId: "a", playerName: "Anna", rank: 1, previousRank: 3, points: 18, matches: 3 })]}
        scoredMatchCount={3}
        totalMatchCount={16}
        hasPreviousState={true}
      />,
    );
    expect(liOf("Anna").getByLabelText("2 Plätze nach oben")).toBeInTheDocument();
  });

  it("shows a down arrow when the player fell in the standings", () => {
    render(
      <DayLiveBanner
        rows={[row({ playerId: "b", playerName: "Ben", rank: 4, previousRank: 2, points: 6, matches: 3 })]}
        scoredMatchCount={3}
        totalMatchCount={16}
        hasPreviousState={true}
      />,
    );
    expect(liOf("Ben").getByLabelText("2 Plätze nach unten")).toBeInTheDocument();
  });

  it("uses singular 'Platz' for a one-rank movement", () => {
    render(
      <DayLiveBanner
        rows={[row({ playerId: "a", playerName: "Anna", rank: 1, previousRank: 2, points: 10, matches: 2 })]}
        scoredMatchCount={2}
        totalMatchCount={16}
        hasPreviousState={true}
      />,
    );
    expect(liOf("Anna").getByLabelText("1 Platz nach oben")).toBeInTheDocument();
  });

  it("shows no arrow when the rank did not change", () => {
    render(
      <DayLiveBanner
        rows={[row({ playerId: "a", playerName: "Anna", rank: 2, previousRank: 2, points: 12, matches: 2 })]}
        scoredMatchCount={2}
        totalMatchCount={16}
        hasPreviousState={true}
      />,
    );
    expect(liOf("Anna").queryByLabelText(/nach oben/)).not.toBeInTheDocument();
    expect(liOf("Anna").queryByLabelText(/nach unten/)).not.toBeInTheDocument();
  });

  it("shows no arrow for a player who has no previous rank", () => {
    render(
      <DayLiveBanner
        rows={[row({ playerId: "e", playerName: "Eric", rank: 5, previousRank: null, points: 3, matches: 1 })]}
        scoredMatchCount={3}
        totalMatchCount={16}
        hasPreviousState={true}
      />,
    );
    expect(liOf("Eric").queryByLabelText(/nach oben/)).not.toBeInTheDocument();
    expect(liOf("Eric").queryByLabelText(/nach unten/)).not.toBeInTheDocument();
  });
});
