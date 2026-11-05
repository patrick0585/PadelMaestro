import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { LiveTicket } from "@/components/home/live-ticket";
import { RecapTicket } from "@/components/home/recap-ticket";
import { SeasonCard, SeasonCardEmpty } from "@/components/home/season-card";
import { LeagueTable, type LeagueRow } from "@/components/home/league-table";
import { TrophyShelf } from "@/components/home/trophy-shelf";
import { DuoCards } from "@/components/home/duo-cards";

describe("LiveTicket", () => {
  it("zeigt Fortschritt, letztes Ergebnis und aktuelles Match", () => {
    render(
      <LiveTicket
        data={{
          total: 9,
          segments: ["done", "done", "done", "current", "open", "open", "open", "open", "open"],
          currentNumber: 4,
          last: { matchNumber: 3, team1: ["Jonas", "Finn"], team2: ["Timo", "Lena"], score: [11, 8] },
          current: { matchNumber: 4, team1: ["Jonas", "Timo"], team2: ["Finn", "Lena"] },
        }}
      />,
    );
    expect(screen.getByText("Match 4 von 9")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "11 zu 8" })).toBeInTheDocument();
    expect(screen.getByText(/Jonas & Timo gegen Finn & Lena/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Zum Spieltag/ })).toHaveAttribute("href", "/game-day");
  });

  it("vor dem ersten Ergebnis: Paarung mit gegen", () => {
    render(
      <LiveTicket
        data={{
          total: 2,
          segments: ["current", "open"],
          currentNumber: 1,
          last: null,
          current: { matchNumber: 1, team1: ["A", "B"], team2: ["C", "D"] },
        }}
      />,
    );
    expect(screen.getByText("gegen")).toBeInTheDocument();
    expect(screen.queryByText(/Zuletzt/)).not.toBeInTheDocument();
  });
});

describe("LiveTicket ohne Matches", () => {
  it("zeigt einen Hinweis statt leerer Segmente", () => {
    render(<LiveTicket data={{ total: 0, segments: [], currentNumber: null, last: null, current: null }} />);
    expect(screen.getByText("Noch keine Matches")).toBeInTheDocument();
  });
});

describe("RecapTicket", () => {
  it("zeigt das Podium des letzten Spieltags", () => {
    render(
      <RecapTicket
        dateLabel="29.10."
        podium={[
          { playerId: "1", name: "Jonas", rank: 1, ppg: 5.9 },
          { playerId: "2", name: "Timo", rank: 1, ppg: 5.9 },
          { playerId: "3", name: "Finn", rank: 2, ppg: 5.2 },
        ]}
      />,
    );
    expect(screen.getByText("Letzter Spieltag · 29.10.")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Platz 1")).toHaveLength(2);
    expect(screen.getAllByRole("listitem").filter((li) => li.className.includes("outline-lime"))).toHaveLength(2);
    expect(screen.getByText("Nächster Spieltag noch nicht geplant")).toBeInTheDocument();
  });

  it("ohne beendeten Spieltag ein kurzer Hinweis", () => {
    render(<RecapTicket dateLabel={null} podium={[]} />);
    expect(screen.getByText("Noch kein Spieltag geplant")).toBeInTheDocument();
  });
});

describe("SeasonCard", () => {
  it("PPG, Gewinnquote, Rang, Dabei und Form", () => {
    render(
      <SeasonCard
        seasonName="Saison 2026"
        groupName="Donnerstagsrunde"
        ppg={5.333}
        wins={14}
        matches={21}
        rank={1}
        rankedCount={6}
        attended={7}
        totalDays={8}
        jokersUsed={1}
        form={[4.8, 5.6, 6.1, 4.2, 5.9]}
      />,
    );
    expect(screen.getByText("5.33")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
    expect(screen.getByText("14 von 21")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("7/8")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Form der letzten 5 Spieltage: 4.8, 5.6, 6.1, 4.2, 5.9/ })).toBeInTheDocument();
  });

  it("Leerzustand", () => {
    render(<SeasonCardEmpty seasonName="Saison 2026" jokersRemaining={2} />);
    expect(screen.getByText("Dein erster Spieltag zählt")).toBeInTheDocument();
    expect(screen.getByText("Joker")).toBeInTheDocument();
  });
});

describe("LeagueTable", () => {
  const row = (over: Partial<LeagueRow>): LeagueRow => ({
    playerId: "x",
    name: "X",
    avatarVersion: 0,
    rank: 1,
    points: 40,
    ppg: 5,
    form: [5, 6],
    isMe: false,
    ...over,
  });

  it("hebt die eigene Zeile hervor und verlinkt zur Rangliste", () => {
    render(
      <LeagueTable
        rows={[
          row({ playerId: "a", name: "Anna", rank: 1, points: 50 }),
          row({ playerId: "b", name: "Ben", rank: 2, points: 45 }),
          row({ playerId: "c", name: "Clara", rank: 3, points: 41 }),
          row({ playerId: "me", name: "Patrick", rank: 6, points: 20, isMe: true }),
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[3]).toHaveAttribute("aria-current", "true");
    expect(items[3]).toHaveTextContent("Du ·");
    expect(screen.getByRole("link", { name: "Rangliste" })).toHaveAttribute("href", "/ranking");
  });
});

describe("TrophyShelf und DuoCards", () => {
  it("zählt Medaillen", () => {
    render(<TrophyShelf medals={{ gold: 3, silver: 2, bronze: 1 }} />);
    expect(screen.getByText("6 Medaillen")).toBeInTheDocument();
  });

  it("zeigt bestes Duo und Platzhalter ohne schlechtestes", () => {
    render(
      <DuoCards best={{ playerId: "f", name: "Finn Overbeck", avatarVersion: 0, pointsTogether: 31, matches: 5 }} worst={null} />,
    );
    expect(screen.getByText("Finn")).toBeInTheDocument();
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText(/zu wenig Partner-Daten/)).toBeInTheDocument();
  });
});
