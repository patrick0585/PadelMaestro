import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ParticipantsRoster, type RosterRow } from "@/app/admin/participants-roster";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function row(overrides: Partial<RosterRow> = {}): RosterRow {
  return {
    playerId: "p1",
    name: "Werner",
    attendance: "pending",
    jokersRemaining: 2,
    ...overrides,
  };
}

describe("<ParticipantsRoster>", () => {
  it("renders a Joker badge when the player's attendance is joker", () => {
    render(<ParticipantsRoster gameDayId="gd-1" participants={[row({ attendance: "joker" })]} />);
    expect(screen.getByText("Joker")).toBeInTheDocument();
  });

  it("pool rows without a joker and with jokers remaining show a set-joker button", () => {
    render(<ParticipantsRoster gameDayId="gd-1" participants={[row()]} />);
    expect(screen.getByRole("button", { name: /Joker für Werner setzen/ })).toBeInTheDocument();
  });

  it("pool rows with no jokers remaining show a disabled 'Keine Joker übrig' button", () => {
    render(
      <ParticipantsRoster
        gameDayId="gd-1"
        participants={[row({ jokersRemaining: 0 })]}
      />,
    );
    expect(screen.getByRole("button", { name: /Keine Joker übrig/ })).toBeDisabled();
  });

  it("joker rows show a remove-joker button", () => {
    render(
      <ParticipantsRoster
        gameDayId="gd-1"
        participants={[row({ attendance: "joker" })]}
      />,
    );
    expect(screen.getByRole("button", { name: /Joker entfernen/ })).toBeInTheDocument();
  });
});
