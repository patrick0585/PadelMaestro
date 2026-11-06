import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { HomeView, type HomeViewProps } from "@/components/home/home-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const base: HomeViewProps = {
  firstName: "Markus",
  emailNotice: null,
  live: null,
  hero: null,
  recap: null,
  season: { kind: "empty", seasonName: "Saison 2026", jokersRemaining: 3 },
  table: null,
};

describe("HomeView", () => {
  it("zeigt Begrüßung und leere Saisonkarte ohne weitere Karten", () => {
    render(<HomeView {...base} />);
    expect(screen.getByRole("heading", { level: 1, name: "Hi, Markus" })).toBeInTheDocument();
    expect(screen.getByText("Dein erster Spieltag zählt")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Nächster Spieltag" })).not.toBeInTheDocument();
    expect(screen.queryByText("Tabelle")).not.toBeInTheDocument();
  });

  it("zeigt Live-Ticket und Tabelle, wenn Daten da sind", () => {
    render(
      <HomeView
        {...base}
        live={{
          total: 2,
          segments: ["current", "open"],
          currentNumber: 1,
          last: null,
          current: { matchNumber: 1, team1: ["A", "B"], team2: ["C", "D"] },
        }}
        table={{
          rows: [{ playerId: "p1", name: "Markus K.", avatarVersion: 0, rank: 1, points: 12, ppg: 4, form: [], isMe: true }],
          myGap: null,
        }}
      />,
    );
    expect(screen.getByText("Match 1 von 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tabelle" })).toBeInTheDocument();
  });

  it("dämpft die Saisonkarte, wenn der Rückblick gezeigt wird", () => {
    render(
      <HomeView
        {...base}
        recap={{ dateLabel: "29.10.", podium: [] }}
        season={{
          kind: "played",
          card: {
            seasonName: "Saison 2026",
            groupName: "Runde",
            ppg: 5,
            wins: 3,
            matches: 6,
            attended: 2,
            totalDays: 2,
            jokersUsed: 0,
            jokersTotal: 0,
            form: [],
          },
        }}
      />,
    );
    expect(screen.getByText("Letzter Spieltag · 29.10.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Saison 2026" }).className).not.toContain("radial-gradient");
  });

  it("zeigt den E-Mail-Hinweis kompakt", () => {
    localStorage.clear();
    render(<HomeView {...base} emailNotice={{ variant: "unverified", pending: null }} />);
    expect(screen.getByText(/E-Mail bestätigen/)).toBeInTheDocument();
  });
});
