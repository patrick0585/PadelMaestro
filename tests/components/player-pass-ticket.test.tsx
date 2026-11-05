import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PlayerPassTicket, type PlayerPassTicketProps } from "@/app/profil/player-pass-ticket";

const base: PlayerPassTicketProps = {
  playerId: "p1",
  name: "Patrick",
  avatarVersion: 0,
  groupName: "Padel-Runde",
  roleLabel: "Besitzer",
  memberSince: new Date("2025-04-10T00:00:00Z"),
  seasonName: "Saison 2026",
  stats: { rank: 3, ppg: 1.8412, attended: 14 },
};

describe("<PlayerPassTicket>", () => {
  it("shows name, group, role, member-since and season stats", () => {
    render(<PlayerPassTicket {...base} />);
    expect(screen.getByRole("heading", { name: "Patrick" })).toBeInTheDocument();
    const ticket = screen.getByRole("region", { name: "Spielerpass" });
    expect(ticket).toHaveTextContent("Spielerpass · Padel-Runde");
    expect(ticket).toHaveTextContent("Besitzer");
    expect(ticket).toHaveTextContent("Dabei seit April 2025");
    expect(ticket).toHaveTextContent("3.");
    expect(ticket).toHaveTextContent("1.84");
    expect(screen.getByText("Spieltage").parentElement).toHaveTextContent("14");
    expect(screen.getByRole("link", { name: "Profilbild ändern" })).toHaveAttribute("href", "/profil/foto");
  });

  it("shows a hint instead of stats before the first game", () => {
    render(<PlayerPassTicket {...base} stats={null} />);
    expect(screen.getByText("Noch keine Spiele in Saison 2026")).toBeInTheDocument();
    expect(screen.queryByText("Rang")).toBeNull();
  });

  it("omits the stats area without an active season and the pill without a group", () => {
    render(<PlayerPassTicket {...base} seasonName={null} stats={null} groupName={null} roleLabel={null} />);
    expect(screen.getByRole("region")).toHaveTextContent(/^Spielerpass/);
    expect(screen.queryByText(/Noch keine Spiele/)).toBeNull();
    expect(screen.queryByText("Besitzer")).toBeNull();
  });
});
