import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { GameDaysView } from "@/app/admin/spieltage/game-days-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const date = (n: number) => new Date(Date.UTC(2026, 10, n));

const base = {
  open: [{ id: "p1", date: date(11), status: "planned" as const, confirmed: 5, total: 6 }],
  recent: [{ id: "f1", date: date(4), winners: ["Jonas", "Mara"] }],
  seasonName: "Saison 2026",
  maxJokers: 2,
};

describe("<GameDaysView>", () => {
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
    expect(screen.getByText("🥇 Jonas · Mara")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Jonas · Mara/ })).toHaveAttribute("href", "/archive/f1");
  });

  it("links a running day to /game-day with pill Läuft", () => {
    render(
      <GameDaysView
        {...base}
        open={[{ id: "r1", date: date(12), status: "in_progress", confirmed: 6, total: 6 }]}
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

  it("opens the close-season dialog from the red entry", async () => {
    render(<GameDaysView {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Saison abschließen…" }));
    expect(screen.getByLabelText("Name der neuen Saison")).toBeInTheDocument();
  });
});
