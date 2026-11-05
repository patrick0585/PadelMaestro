import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AdminOverviewView } from "@/app/admin/overview-view";
import type { AdminOverview } from "@/lib/admin/overview";

const base: AdminOverview = {
  hero: {
    kind: "planned",
    id: "d1",
    date: new Date(Date.UTC(2026, 10, 11)),
    startTime: null,
    confirmed: 5,
    total: 6,
    pending: 1,
  },
  seasonName: "Saison 2026",
  seasonStart: new Date(Date.UTC(2026, 0, 1)),
  finishedCount: 34,
  plannedCount: 1,
  memberCount: 6,
  openInvitationCount: 2,
  groupName: "Padelmaestro",
};

function view(over: Partial<AdminOverview> = {}, welcome = false) {
  return render(<AdminOverviewView {...base} {...over} welcome={welcome} />);
}

describe("<AdminOverviewView>", () => {
  it("renders title, planned hero and rows", () => {
    view();
    expect(screen.getByRole("heading", { level: 1, name: "Verwaltung" })).toBeInTheDocument();
    expect(screen.getByText("Nächster Spieltag")).toBeInTheDocument();
    expect(screen.getByText("5 von 6 zugesagt · 1 offen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Nächster Spieltag/ })).toHaveAttribute(
      "href",
      "/admin/spieltage/d1",
    );
    expect(screen.getByText("34 gespielt · 1 geplant")).toBeInTheDocument();
    expect(screen.getByText("seit 01.01.")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("2 Links offen")).toBeInTheDocument();
    expect(screen.getByText("Padelmaestro")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Spieltage/ })).toHaveAttribute("href", "/admin/spieltage");
    expect(screen.getByRole("link", { name: /Saison/ })).toHaveAttribute("href", "/admin/saison");
    expect(screen.getByRole("link", { name: /Spieler/ })).toHaveAttribute("href", "/admin/spieler");
    expect(screen.getByRole("link", { name: /Einladen/ })).toHaveAttribute("href", "/admin/einladen");
    expect(screen.getByRole("link", { name: /Einstellungen/ })).toHaveAttribute(
      "href",
      "/admin/einstellungen",
    );
  });

  it("links a running hero to /game-day", () => {
    view({ hero: { kind: "running", id: "d2", date: new Date(Date.UTC(2026, 10, 4)) } });
    expect(screen.getByRole("link", { name: /Zum laufenden Spieltag/ })).toHaveAttribute(
      "href",
      "/game-day",
    );
  });

  it("offers to create a game day without hero", () => {
    view({ hero: { kind: "none" } });
    expect(screen.getByText("Kein Spieltag geplant")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Spieltag anlegen" })).toHaveAttribute(
      "href",
      "/admin/spieltage",
    );
  });

  it("shows the welcome message only when requested", () => {
    const { unmount } = view({}, true);
    expect(
      screen.getByText("Deine Gruppe steht. Lade jetzt deine Mitspieler ein."),
    ).toBeInTheDocument();
    unmount();
    view();
    expect(screen.queryByText(/Deine Gruppe steht/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Historische Daten/)).not.toBeInTheDocument();
  });
});
