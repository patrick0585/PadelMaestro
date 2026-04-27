import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RankingTable } from "@/components/ranking-table";
import type { RankingRow } from "@/lib/ranking/compute";

function row(overrides: Partial<RankingRow>): RankingRow {
  return {
    rank: 1,
    playerId: "p1",
    playerName: "Paul",
    avatarVersion: 0,
    points: 0,
    pointsPerGame: 0,
    games: 0,
    jokersUsed: 0,
    medals: { gold: 0, silver: 0, bronze: 0 },
    ...overrides,
  };
}

function scopeTo(name: string) {
  const li = screen.getByText(name).closest("li");
  if (!li) throw new Error(`no row for ${name}`);
  return within(li);
}

describe("<RankingTable>", () => {
  it("renders the empty state when no rows are given", () => {
    render(<RankingTable ranking={[]} />);
    expect(screen.getByText(/noch keine Spieler/i)).toBeInTheDocument();
  });

  it("renders gold/silver/bronze medals for the top three ranks", () => {
    render(
      <RankingTable
        ranking={[
          row({ rank: 1, playerId: "p1", playerName: "Paul" }),
          row({ rank: 2, playerId: "p2", playerName: "Michi" }),
          row({ rank: 3, playerId: "p3", playerName: "Patrick" }),
          row({ rank: 4, playerId: "p4", playerName: "Thomas" }),
        ]}
      />,
    );
    expect(screen.getByLabelText("Platz 1")).toHaveTextContent("🥇");
    expect(screen.getByLabelText("Platz 2")).toHaveTextContent("🥈");
    expect(screen.getByLabelText("Platz 3")).toHaveTextContent("🥉");
    expect(screen.queryByLabelText("Platz 4")).toBeNull();
    expect(scopeTo("Thomas").getByText("4")).toBeInTheDocument();
  });

  it("gives both tied bronze players a bronze medal", () => {
    render(
      <RankingTable
        ranking={[
          row({ rank: 1, playerId: "p1", playerName: "Paul" }),
          row({ rank: 2, playerId: "p2", playerName: "Michi" }),
          row({ rank: 3, playerId: "p3", playerName: "Patrick" }),
          row({ rank: 3, playerId: "p4", playerName: "Thomas" }),
        ]}
      />,
    );
    expect(screen.getAllByLabelText("Platz 3")).toHaveLength(2);
  });

  it("shows total points, points per game, games, and jokers for each row", () => {
    render(
      <RankingTable
        ranking={[
          row({
            rank: 1,
            playerId: "p1",
            playerName: "Paul",
            points: 45,
            pointsPerGame: 3.75,
            games: 12,
            jokersUsed: 2,
          }),
        ]}
      />,
    );
    const scoped = scopeTo("Paul");
    expect(scoped.getByText("45")).toBeInTheDocument();
    expect(scoped.getByText("3.75")).toBeInTheDocument();
    expect(scoped.getByText("12")).toBeInTheDocument();
    expect(scoped.getByText("2")).toBeInTheDocument();
  });

  it("renders 0 for zero points and zero jokers", () => {
    render(
      <RankingTable
        ranking={[
          row({
            rank: 1,
            playerId: "p1",
            playerName: "Paul",
            points: 0,
            pointsPerGame: 0,
            games: 0,
            jokersUsed: 0,
          }),
        ]}
      />,
    );
    const scoped = scopeTo("Paul");
    expect(scoped.getByText("0.00")).toBeInTheDocument();
    expect(scoped.getAllByText("0")).toHaveLength(3);
  });

  it("renders the Joker column header", () => {
    render(<RankingTable ranking={[row({})]} />);
    expect(screen.getByText("Jkr")).toBeInTheDocument();
  });

  it("renders a medal subline under the player name when medals exist", () => {
    render(
      <RankingTable
        ranking={[
          row({
            rank: 1,
            playerId: "p1",
            playerName: "Paul",
            medals: { gold: 5, silver: 2, bronze: 1 },
          }),
        ]}
      />,
    );
    const scoped = scopeTo("Paul");
    expect(scoped.getByLabelText("5 Gold, 2 Silber, 1 Bronze")).toBeInTheDocument();
    expect(scoped.getByText(/🥇5/)).toBeInTheDocument();
    expect(scoped.getByText(/🥈2/)).toBeInTheDocument();
    expect(scoped.getByText(/🥉1/)).toBeInTheDocument();
  });

  it("omits the medal subline when the player has no medals", () => {
    render(
      <RankingTable
        ranking={[
          row({
            rank: 5,
            playerId: "p5",
            playerName: "Rene",
            medals: { gold: 0, silver: 0, bronze: 0 },
          }),
        ]}
      />,
    );
    const scoped = scopeTo("Rene");
    expect(scoped.queryByText(/🥇/)).toBeNull();
    expect(scoped.queryByText(/🥈/)).toBeNull();
    expect(scoped.queryByText(/🥉/)).toBeNull();
  });

  it("hides medal types the player has zero of", () => {
    render(
      <RankingTable
        ranking={[
          row({
            rank: 4,
            playerId: "p4",
            playerName: "Thomas",
            medals: { gold: 0, silver: 1, bronze: 0 },
          }),
        ]}
      />,
    );
    const scoped = scopeTo("Thomas");
    expect(scoped.getByText(/🥈1/)).toBeInTheDocument();
    expect(scoped.queryByText(/🥇/)).toBeNull();
    expect(scoped.queryByText(/🥉/)).toBeNull();
  });
});
