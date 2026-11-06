import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Standings, type StandingRow } from "@/components/ranking/standings";

const row = (rank: number, name: string, over: Partial<StandingRow> = {}): StandingRow => ({
  playerId: name,
  name,
  avatarVersion: 0,
  rank,
  points: 250 - rank * 10,
  ppg: 1.5,
  games: 40,
  jokersUsed: 0,
  medals: { gold: 0, silver: 0, bronze: 0 },
  movement: 0,
  form: [1, 2],
  isMe: false,
  ...over,
});

describe("Standings", () => {
  it("Treppchen: Platz 1 in der Mitte, Rest als Liste ab Platz 4", () => {
    render(
      <Standings
        rows={[row(1, "Werner"), row(2, "Christian"), row(3, "Jonas"), row(4, "Finn"), row(5, "Lena")]}
        myGap={null}
      />,
    );
    const podium = within(screen.getByRole("list", { name: "Podium" })).getAllByRole("listitem");
    // DOM-Reihenfolge 1-2-3 (Vorlesen), sichtbar 2-1-3 über die Grid-Spalten.
    expect(podium.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Werner"),
      expect.stringContaining("Christian"),
      expect.stringContaining("Jonas"),
    ]);
    expect(podium[0].className).toContain("col-start-2");
    expect(podium[1].className).toContain("col-start-1");
    const rest = within(screen.getByRole("list", { name: "Weitere Plätze" })).getAllByRole("listitem");
    expect(rest).toHaveLength(2);
    expect(rest[0]).toHaveTextContent("Finn");
  });

  it("eigene Zeile: hervorgehoben mit Abstand nach vorne, Punkte gerundet", () => {
    render(
      <Standings
        rows={[row(1, "A"), row(2, "B"), row(3, "C"), row(4, "Patrick", { isMe: true, points: 238.69 })]}
        myGap={{ kind: "behind", gap: 7, toRank: 3 }}
      />,
    );
    const me = screen.getAllByRole("listitem").find((li) => li.getAttribute("aria-current") === "true")!;
    expect(me).toHaveTextContent("Patrick");
    expect(me).toHaveTextContent("239");
    expect(me).toHaveTextContent("7 Punkte hinter Platz 3");
  });

  it("auf dem Treppchen steht der eigene Abstand darunter", () => {
    render(<Standings rows={[row(1, "A"), row(2, "Patrick", { isMe: true })]} myGap={{ kind: "behind", gap: 6, toRank: 1 }} />);
    expect(screen.getByText("Du: 6 Punkte hinter Platz 1")).toBeInTheDocument();
  });

  it("geteilte Plätze stehen gemeinsam auf einer Stufe", () => {
    render(
      <Standings
        rows={[row(1, "Anna", { points: 50 }), row(1, "Patrick", { points: 50, isMe: true }), row(2, "Ben"), row(3, "Clara"), row(4, "Dirk")]}
        myGap={{ kind: "tied", rank: 1 }}
      />,
    );
    const podium = within(screen.getByRole("list", { name: "Podium" })).getAllByRole("listitem");
    expect(podium).toHaveLength(3);
    expect(podium[0]).toHaveTextContent("AnnaPatrick");
    expect(podium[0]).toHaveTextContent("geteilt");
    expect(within(podium[0]).getByRole("img", { name: "Geteilter Platz 1" })).toBeInTheDocument();
    expect(podium[0]).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("Du: geteilter Platz 1")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Weitere Plätze" })).getAllByRole("listitem")).toHaveLength(1);
  });

  it("Spitzenreiter sieht den Vorsprung auf dem Treppchen", () => {
    render(<Standings rows={[row(1, "Patrick", { isMe: true }), row(2, "B")]} myGap={{ kind: "lead", over: 8 }} />);
    expect(screen.getByText("Du: 8 Punkte Vorsprung")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Weitere Plätze" })).not.toBeInTheDocument();
  });

  it("Bewegung, Medaillen und Joker in der Zeile", () => {
    render(
      <Standings
        rows={[
          row(1, "A"),
          row(2, "B"),
          row(3, "C"),
          row(4, "D", { movement: 2, jokersUsed: 1, medals: { gold: 1, silver: 0, bronze: 2 } }),
          row(5, "E", { movement: -1 }),
          row(6, "F", { movement: null }),
        ]}
        myGap={null}
      />,
    );
    expect(screen.getByText("2 Plätze hoch seit dem letzten Spieltag")).toBeInTheDocument();
    expect(screen.getByText("1 Platz runter seit dem letzten Spieltag")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")[3]).toHaveTextContent("▲2");
    expect(screen.getAllByRole("listitem")[3]).toHaveTextContent("40 Sp · 1 J");
    expect(screen.getAllByRole("listitem")[3]).toHaveTextContent("🥇1 🥉2");
  });
});
