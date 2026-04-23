import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { JokerBlock } from "@/app/game-day/joker-block";
import type { JokerUseRow } from "@/lib/joker/list";

function row(overrides: Partial<JokerUseRow> = {}): JokerUseRow {
  return {
    playerId: "p1",
    playerName: "Werner",
    avatarVersion: 0,
    ppgAtUse: 1.64,
    gamesCredited: 10,
    pointsCredited: 16.4,
    ...overrides,
  };
}

describe("<JokerBlock>", () => {
  it("renders nothing when the list is empty", () => {
    const { container } = render(<JokerBlock jokers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the heading and one row per Joker", () => {
    render(
      <JokerBlock
        jokers={[row({ playerName: "Anna", pointsCredited: 18.0 }), row({ playerName: "Werner" })]}
      />,
    );
    expect(screen.getByText(/Joker an diesem Tag/)).toBeInTheDocument();
    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText("Werner")).toBeInTheDocument();
  });

  it("formats the ppg with de decimals and rounds credited points", () => {
    render(<JokerBlock jokers={[row({ ppgAtUse: 1.64, pointsCredited: 16.4 })]} />);
    expect(screen.getByText(/10 × 1,64/)).toBeInTheDocument();
    expect(screen.getByText(/≈ 16 P\./)).toBeInTheDocument();
  });

  it("rounds up from 0.5 for credited points", () => {
    render(<JokerBlock jokers={[row({ ppgAtUse: 1.65, pointsCredited: 16.5 })]} />);
    expect(screen.getByText(/≈ 17 P\./)).toBeInTheDocument();
  });
});
