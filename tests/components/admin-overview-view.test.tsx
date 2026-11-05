import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
import { AdminOverviewView } from "@/app/admin/overview-view";
import type { AdminOverview } from "@/lib/admin/overview";

const base: AdminOverview = {
  hero: {
    kind: "planned",
    id: "d1",
    date: new Date(Date.UTC(2026, 10, 11)),
    startTime: null,
    confirmed: 4,
    declined: 1,
    joker: 0,
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
  it("renders title, planned ticket with actions, tiles and rows", () => {
    view();
    expect(screen.getByRole("heading", { level: 1, name: "Verwaltung" })).toBeInTheDocument();
    const ticket = screen.getByRole("region", { name: "Nächster Spieltag" });
    expect(ticket).toHaveTextContent("4 Zusagen · 1 offen · 1 Absage");
    expect(screen.getByRole("link", { name: "Zusagen" })).toHaveAttribute("href", "/admin/spieltage/d1");
    expect(screen.getByTestId("ticket-start")).toHaveTextContent("Starten");
    expect(screen.getByRole("link", { name: /^6 Spieler$/ })).toHaveAttribute("href", "/admin/spieler");
    expect(screen.getByRole("link", { name: /^2 Einladungen$/ })).toHaveAttribute("href", "/admin/einladen");
    expect(screen.getByRole("link", { name: /^34 Gespielt$/ })).toHaveAttribute("href", "/admin/spieltage");
    expect(screen.getByText("34 gespielt · 1 geplant")).toBeInTheDocument();
    expect(screen.getByText("seit 01.01.")).toBeInTheDocument();
    expect(screen.getByText("2 Links offen")).toBeInTheDocument();
    expect(screen.getByText("Padelmaestro")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Saison 2026/ })).toHaveAttribute("href", "/admin/saison");
    expect(screen.getByRole("link", { name: /Einstellungen/ })).toHaveAttribute("href", "/admin/einstellungen");
  });

  it("hides the start action with fewer than four confirmations", () => {
    view({ hero: { ...(base.hero as Extract<AdminOverview["hero"], { kind: "planned" }>), confirmed: 3 } });
    expect(screen.queryByTestId("ticket-start")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zusagen" })).toBeInTheDocument();
  });

  it("hides the start action above six confirmations and explains why", () => {
    view({ hero: { ...(base.hero as Extract<AdminOverview["hero"], { kind: "planned" }>), confirmed: 7, pending: 0, total: 8 } });
    expect(screen.queryByTestId("ticket-start")).not.toBeInTheDocument();
    expect(screen.getByText("Höchstens 6 Zusagen – im Detail anpassen.")).toBeInTheDocument();
  });

  it("shows the kickoff time when set", () => {
    view({ hero: { ...(base.hero as Extract<AdminOverview["hero"], { kind: "planned" }>), startTime: "18:00" } });
    expect(screen.getByRole("region", { name: "Nächster Spieltag" })).toHaveTextContent("Anpfiff18:00");
  });

  it("links a running hero to /game-day", () => {
    view({ hero: { kind: "running", id: "d2", date: new Date(Date.UTC(2026, 10, 4)) } });
    expect(screen.getByRole("region", { name: "Läuft gerade" })).toHaveTextContent("Live");
    expect(screen.getByRole("link", { name: "Zum laufenden Spieltag" })).toHaveAttribute("href", "/game-day");
  });

  it("offers to create a game day without hero", () => {
    view({ hero: { kind: "none" } });
    expect(screen.getByText("Kein Spieltag geplant")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "＋ Spieltag anlegen" })).toHaveAttribute("href", "/admin/spieltage");
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
