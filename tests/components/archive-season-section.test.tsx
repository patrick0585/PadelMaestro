import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DayRow, SeasonSection, ChampionTicket } from "@/app/archive/season-section";
import type { ArchivedGameDayRow } from "@/lib/archive/list";
import type { RankingRow } from "@/lib/ranking/compute";

function day(over: Partial<ArchivedGameDayRow> = {}): ArchivedGameDayRow {
  return {
    id: "d1",
    date: new Date("2026-10-30T00:00:00Z"),
    seasonId: "s1",
    seasonName: "Saison 2026",
    seasonIsActive: true,
    matchCount: 9,
    playerCount: 5,
    jokerCount: 0,
    podium: [
      { playerName: "Lena", points: 14, rank: 1 },
      { playerName: "Patrick", points: 12, rank: 2 },
    ],
    self: { points: 12, matches: 7, rank: 2 },
    ...over,
  };
}

function rank(over: Partial<RankingRow>): RankingRow {
  return {
    rank: 1,
    playerId: "p",
    playerName: "X",
    avatarVersion: 0,
    games: 10,
    points: 20,
    pointsPerGame: 2,
    jokersUsed: 0,
    medals: { gold: 0, silver: 0, bronze: 0 },
    ...over,
  };
}

const renderRow = (row: ArchivedGameDayRow) =>
  render(
    <ul>
      <DayRow row={row} />
    </ul>,
  );

describe("<DayRow>", () => {
  it("shows date block, winner, meta and own place", () => {
    renderRow(day());
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/archive/d1");
    expect(link).toHaveTextContent("30");
    expect(link).toHaveTextContent("Okt");
    expect(link).toHaveTextContent("Lena");
    expect(link).toHaveTextContent("9 Matches · 5 Spieler");
    expect(screen.getByText("Du: 2.")).toBeInTheDocument();
  });

  it("says 'nicht dabei' without a self block", () => {
    renderRow(day({ self: null }));
    expect(screen.getByText("nicht dabei")).toBeInTheDocument();
  });

  it("joins shared winners", () => {
    renderRow(day({ podium: [{ playerName: "Timo", points: 12, rank: 1 }, { playerName: "Jonas", points: 12, rank: 1 }] }));
    expect(screen.getByRole("link")).toHaveTextContent("Timo · Jonas");
  });

  it("shows the joker badge only when jokers were used", () => {
    renderRow(day({ jokerCount: 2 }));
    expect(screen.getByTestId("joker-badge")).toHaveTextContent("Joker 2");
    expect(screen.getByText(", 2 Joker eingesetzt")).toHaveClass("sr-only");
  });

  it("omits the joker badge without jokers", () => {
    renderRow(day());
    expect(screen.queryByTestId("joker-badge")).not.toBeInTheDocument();
  });
});

describe("<SeasonSection>", () => {
  it("is collapsed by default and summarizes the active season", () => {
    const { container } = render(
      <SeasonSection section={{ seasonId: "s1", seasonName: "Saison 2026", seasonIsActive: true, rows: [day(), day({ id: "d2" })] }} ranking={null} />,
    );
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.getByText("2 Spieltage")).toBeInTheDocument();
    expect(screen.getByText("laufend")).toBeInTheDocument();
    expect(screen.getByText(/Zuletzt 30. Okt/)).toHaveTextContent(/Zuletzt 30. Okt · .* Lena/);
  });

  it("shows the champion ticket for a closed season", () => {
    render(
      <SeasonSection
        section={{ seasonId: "s0", seasonName: "Saison 2025", seasonIsActive: false, rows: [day({ seasonIsActive: false })] }}
        ranking={[rank({ playerId: "a", playerName: "Jonas", points: 312 })]}
      />,
    );
    expect(screen.getByRole("region", { name: "Endstand Saison 2025" })).toHaveTextContent("Jonas");
    expect(screen.getByText("abgeschlossen")).toBeInTheDocument();
  });
});

describe("<DayRow> edge cases", () => {
  it("shows 'Kein Ergebnis' for an empty podium", () => {
    renderRow(day({ podium: [] }));
    expect(screen.getByRole("link")).toHaveTextContent("Kein Ergebnis");
    expect(screen.queryByRole("img", { name: "Tagessieg" })).not.toBeInTheDocument();
  });

  it("uses the singular for one match", () => {
    renderRow(day({ matchCount: 1 }));
    expect(screen.getByRole("link")).toHaveTextContent("1 Match · 5 Spieler");
  });

  it("highlights first place as 'Du: 1.'", () => {
    renderRow(day({ self: { points: 14, matches: 7, rank: 1 } }));
    expect(screen.getByText("Du: 1.")).toBeInTheDocument();
  });
});

describe("<SeasonSection> edge cases", () => {
  const open = { seasonId: "s1", seasonName: "Saison 2026", seasonIsActive: true };

  it("omits 'Zuletzt' when the latest day has no winner", () => {
    render(<SeasonSection section={{ ...open, rows: [day({ podium: [] })] }} ranking={null} />);
    expect(screen.getByText("1 Spieltag")).toBeInTheDocument();
    expect(screen.queryByText(/Zuletzt/)).not.toBeInTheDocument();
  });

  it("omits 'Zuletzt' for a closed season", () => {
    render(<SeasonSection section={{ ...open, seasonIsActive: false, rows: [day()] }} ranking={null} />);
    expect(screen.queryByText(/Zuletzt/)).not.toBeInTheDocument();
  });

  it("handles a season without rows", () => {
    render(<SeasonSection section={{ ...open, rows: [] }} ranking={null} />);
    expect(screen.getByText("0 Spieltage")).toBeInTheDocument();
  });

  it("renders no ticket when the ranking has no champion", () => {
    render(<SeasonSection section={{ ...open, seasonIsActive: false, rows: [day()] }} ranking={[]} />);
    expect(screen.queryByRole("region", { name: /Endstand/ })).not.toBeInTheDocument();
  });
});

describe("<ChampionTicket>", () => {
  it("lists both players tied at rank 2", () => {
    render(
      <ChampionTicket
        seasonName="S"
        ranking={[
          rank({ playerId: "a", playerName: "Jonas", points: 300 }),
          rank({ playerId: "b", playerName: "Lena", points: 280, rank: 2 }),
          rank({ playerId: "c", playerName: "Finn", points: 280, rank: 2 }),
          rank({ playerId: "d", playerName: "Timo", points: 200, rank: 3 }),
        ]}
      />,
    );
    const ticket = screen.getByRole("region");
    expect(within(ticket).getAllByLabelText("Platz 2")).toHaveLength(2);
    expect(within(ticket).getByLabelText("Platz 3").parentElement).toHaveTextContent("Timo 200");
  });

  it("omits the runner-up list when only champions exist", () => {
    render(<ChampionTicket seasonName="S" ranking={[rank({ playerName: "Solo" })]} />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("formats points and average", () => {
    render(<ChampionTicket seasonName="S" ranking={[rank({ points: 311.6, pointsPerGame: 2.456 })]} />);
    expect(screen.getByRole("region")).toHaveTextContent("312 Punkte · Ø 2.46");
  });

  it("lists shared champions and runners-up with medals", () => {
    render(
      <ChampionTicket
        seasonName="Saison 2025"
        ranking={[
          rank({ playerId: "a", playerName: "Jonas", points: 300 }),
          rank({ playerId: "b", playerName: "Lena", points: 300 }),
          rank({ playerId: "c", playerName: "Finn", points: 280, rank: 2 }),
          rank({ playerId: "d", playerName: "Timo", points: 200, rank: 4 }),
        ]}
      />,
    );
    const ticket = screen.getByRole("region");
    expect(ticket).toHaveTextContent("Jonas · Lena");
    expect(within(ticket).getByLabelText("Platz 2").parentElement).toHaveTextContent("Finn 280");
    expect(ticket).not.toHaveTextContent("Timo");
  });

  it("renders nothing for an empty ranking", () => {
    const { container } = render(<ChampionTicket seasonName="S" ranking={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
