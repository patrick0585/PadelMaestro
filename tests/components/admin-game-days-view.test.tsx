import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { GameDaysView } from "@/app/admin/spieltage/game-days-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const date = (n: number) => new Date(Date.UTC(2026, 10, n));

const base = {
  open: [{ id: "p1", date: date(11), status: "planned" as const, startTime: null, confirmed: 5, total: 6 }],
  recent: [{ id: "f1", date: date(4), winners: ["Jonas", "Mara"], winnerPoints: 12, playerCount: 5 }],
  seasonName: "Saison 2026",
  maxJokers: 2,
};

describe("<GameDaysView>", () => {
  it("zeigt den Anpfiff hinter dem Datum", () => {
    render(<GameDaysView {...base} open={[{ ...base.open[0], startTime: "18:00" }]} />);
    expect(screen.getByText(/· 18:00 Uhr/)).toBeInTheDocument();
  });

  it("renders create button, open day and recent winners", () => {
    render(<GameDaysView {...base} />);
    expect(screen.getByTestId("create-game-day")).toHaveTextContent("＋ Spieltag anlegen");
    expect(screen.getByText("Offen")).toBeInTheDocument();
    expect(screen.getByText("5 / 6 zugesagt")).toBeInTheDocument();
    expect(screen.getByText("Geplant")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /5 \/ 6 zugesagt/ })).toHaveAttribute(
      "href",
      "/admin/spieltage/p1",
    );
    expect(screen.getByText("Zuletzt gespielt")).toBeInTheDocument();
    const recent = screen.getByRole("link", { name: /Jonas · Mara/ });
    expect(recent).toHaveAttribute("href", "/archive/f1");
    expect(recent).toHaveTextContent("04");
    expect(recent).toHaveTextContent("Nov");
    expect(recent).toHaveTextContent("12 Punkte");
    expect(recent).toHaveTextContent("5 Spieler");
  });

  it("links a running day to /game-day with pill Läuft", () => {
    render(
      <GameDaysView
        {...base}
        open={[{ id: "r1", date: date(12), status: "in_progress", startTime: null, confirmed: 6, total: 6 }]}
      />,
    );
    expect(screen.getByText("Läuft")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Läuft/ })).toHaveAttribute("href", "/game-day");
  });

  it("shows empty text when nothing was played", () => {
    render(<GameDaysView {...base} recent={[]} open={[]} />);
    expect(screen.getByText("Noch keine Spieltage gespielt")).toBeInTheDocument();
    expect(screen.queryByText("Offen")).not.toBeInTheDocument();
  });

  it("shows 'Kein Ergebnis' without points for a day with no scored matches", () => {
    render(<GameDaysView {...base} recent={[{ id: "f2", date: date(3), winners: [], winnerPoints: null, playerCount: 4 }]} />);
    const row = screen.getByRole("link", { name: /Kein Ergebnis/ });
    expect(row).toHaveTextContent("4 Spieler");
    expect(row).not.toHaveTextContent("Punkte");
  });

  it("opens the close-season dialog from the red entry", async () => {
    render(<GameDaysView {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Saison abschließen…" }));
    expect(screen.getByLabelText("Name der neuen Saison")).toBeInTheDocument();
  });
});
