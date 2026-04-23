import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RosterChips, type RosterParticipant } from "@/app/game-day/roster-chips";

function p(name: string, attendance: RosterParticipant["attendance"]): RosterParticipant {
  return { playerId: name.toLowerCase(), name, attendance };
}

describe("<RosterChips>", () => {
  it("renders chip rows for confirmed, pending, declined, and joker", () => {
    render(
      <RosterChips
        participants={[
          p("Anna", "confirmed"),
          p("Ben", "pending"),
          p("Carl", "declined"),
          p("Dora", "joker"),
        ]}
      />,
    );
    expect(screen.getByText(/Dabei · 1/)).toBeInTheDocument();
    expect(screen.getByText(/Offen · 1/)).toBeInTheDocument();
    expect(screen.getByText(/Abgesagt · 1/)).toBeInTheDocument();
    expect(screen.getByText(/Joker · 1/)).toBeInTheDocument();
    expect(screen.getByText("Dora")).toBeInTheDocument();
  });

  it("excludes Joker participants from the other three buckets", () => {
    render(
      <RosterChips participants={[p("Dora", "joker")]} />,
    );
    expect(screen.getByText(/Dabei · 0/)).toBeInTheDocument();
    expect(screen.getByText(/Offen · 0/)).toBeInTheDocument();
    expect(screen.getByText(/Abgesagt · 0/)).toBeInTheDocument();
    expect(screen.getByText(/Joker · 1/)).toBeInTheDocument();
  });

  it("hides the Joker row when no participant has attendance=joker", () => {
    render(
      <RosterChips participants={[p("Anna", "confirmed")]} />,
    );
    expect(screen.queryByText(/Joker · /)).not.toBeInTheDocument();
  });
});
