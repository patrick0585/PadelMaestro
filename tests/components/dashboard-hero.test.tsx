import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DashboardHero, type HeroState } from "@/app/dashboard-hero";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function member(overrides: Partial<Extract<HeroState, { kind: "member" }>> = {}): HeroState {
  return {
    kind: "member",
    gameDayId: "gd-1",
    weekday: "Donnerstag",
    dateShort: "30.04.",
    startTime: null,
    countdown: "in 8 Tagen",
    confirmed: 3,
    pending: 3,
    total: 6,
    pips: [],
    attendance: "pending",
    jokersRemaining: 2,
    jokersTotal: 2,
    jokerGamesCredited: 15,
    ppgSnapshot: 1.64,
    ...overrides,
  };
}

describe("<DashboardHero> (member)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));
  });

  it("renders three toggle buttons labelled Zusagen / Absagen / Joker", () => {
    render(<DashboardHero state={member()} />);
    expect(screen.getByRole("button", { name: "Zusagen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Absagen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Joker" })).toBeInTheDocument();
  });

  it("marks the active choice with aria-pressed=true", () => {
    render(<DashboardHero state={member({ attendance: "confirmed" })} />);
    expect(screen.getByRole("button", { name: "Zusagen" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Absagen" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Joker" })).toHaveAttribute("aria-pressed", "false");
  });

  it("marks no button active when attendance is pending", () => {
    render(<DashboardHero state={member({ attendance: "pending" })} />);
    expect(screen.getByRole("button", { name: "Zusagen" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Absagen" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Joker" })).toHaveAttribute("aria-pressed", "false");
  });

  it("marks Absagen active when attendance is declined", () => {
    render(<DashboardHero state={member({ attendance: "declined" })} />);
    expect(screen.getByRole("button", { name: "Zusagen" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Absagen" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Joker" })).toHaveAttribute("aria-pressed", "false");
  });

  it("marks Joker active when attendance is joker", () => {
    render(<DashboardHero state={member({ attendance: "joker" })} />);
    expect(screen.getByRole("button", { name: "Zusagen" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Absagen" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Joker" })).toHaveAttribute("aria-pressed", "true");
  });

  it("disables Joker when no jokers are remaining and shows helper text", () => {
    render(<DashboardHero state={member({ jokersRemaining: 0 })} />);
    expect(screen.getByRole("button", { name: "Joker" })).toBeDisabled();
    expect(screen.getByText(/Keine Joker mehr in dieser Saison/)).toBeInTheDocument();
  });

  it("opens the confirm dialog when Joker is clicked", async () => {
    render(<DashboardHero state={member()} />);
    await userEvent.click(screen.getByRole("button", { name: "Joker" }));
    expect(await screen.findByRole("dialog", { name: /Joker einsetzen/ })).toBeInTheDocument();
  });

  it("POSTs /api/jokers after confirming the dialog", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal("fetch", fetchSpy);
    render(<DashboardHero state={member()} />);
    await userEvent.click(screen.getByRole("button", { name: "Joker" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Joker setzen" }),
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/jokers");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ gameDayId: "gd-1" });
  });

  it("DELETEs /api/jokers then POSTs attendance when switching away from joker", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 204 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchSpy);
    render(<DashboardHero state={member({ attendance: "joker" })} />);
    await userEvent.click(screen.getByRole("button", { name: "Zusagen" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/jokers");
    expect(fetchSpy.mock.calls[0][1].method).toBe("DELETE");
    expect(fetchSpy.mock.calls[1][0]).toBe("/api/game-days/gd-1/attendance");
    expect(fetchSpy.mock.calls[1][1].method).toBe("POST");
  });

  it("zeigt Datum und Countdown groß, wenn keine Uhrzeit gesetzt ist", () => {
    render(<DashboardHero state={member()} />);
    expect(screen.getByText("30.04.")).toBeInTheDocument();
    expect(screen.getByText("Donnerstag")).toBeInTheDocument();
    expect(screen.getByText("in 8 Tagen")).toBeInTheDocument();
    expect(screen.queryByText("Anpfiff")).not.toBeInTheDocument();
  });

  it("zeigt Anpfiff und Countdown-Chip, wenn eine Uhrzeit gesetzt ist", () => {
    render(<DashboardHero state={member({ startTime: "18:00" })} />);
    expect(screen.getByText("18:00")).toBeInTheDocument();
    expect(screen.getByText("Anpfiff")).toBeInTheDocument();
    expect(screen.getByText("in 8 Tagen")).toBeInTheDocument();
  });

  it("zählt nur unbeantwortete als offen", () => {
    const { container } = render(<DashboardHero state={member({ confirmed: 3, pending: 1, total: 6 })} />);
    expect(screen.getByText(/zugesagt · 1 offen/)).toBeInTheDocument();
    expect(container.querySelectorAll(".border-dashed")).toHaveLength(1);
  });

  it("zeigt Zusagen als Avatare, offene Plätze als Platzhalter und den eigenen Status", () => {
    const pips = ["a", "b", "c"].map((id) => ({ playerId: id, name: id.toUpperCase(), avatarVersion: 0 }));
    const { container } = render(<DashboardHero state={member({ pips })} />);
    expect(screen.getByText(/zugesagt · 3 offen/)).toBeInTheDocument();
    expect(container.querySelectorAll(".border-dashed")).toHaveLength(3);
    expect(screen.getByText("noch offen")).toBeInTheDocument();
  });

  it("shows ATTENDANCE_LOCKED message when the server returns 409 with that code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "ATTENDANCE_LOCKED" }),
      }),
    );
    render(<DashboardHero state={member()} />);
    await userEvent.click(screen.getByRole("button", { name: "Zusagen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Spieltag ist bereits gestartet/i,
    );
  });

  it("shows ATTENDANCE_NOT_PARTICIPANT message when the server returns 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ code: "ATTENDANCE_NOT_PARTICIPANT" }),
      }),
    );
    render(<DashboardHero state={member()} />);
    await userEvent.click(screen.getByRole("button", { name: "Absagen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /nicht Teilnehmer/i,
    );
  });

  it("includes the HTTP status and re-login hint in the generic error for a 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      }),
    );
    render(<DashboardHero state={member()} />);
    await userEvent.click(screen.getByRole("button", { name: "Zusagen" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Teilnahme konnte nicht gespeichert werden/i);
    expect(alert).toHaveTextContent(/500/);
    expect(alert).toHaveTextContent(/abmelden und neu anmelden/i);
  });

  it("shows a session-expired message when the server returns 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "unauthenticated" }),
      }),
    );
    render(<DashboardHero state={member()} />);
    await userEvent.click(screen.getByRole("button", { name: "Zusagen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Sitzung ist abgelaufen/i);
  });

  it("shows a connection error when fetch rejects (network drop)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<DashboardHero state={member()} />);
    await userEvent.click(screen.getByRole("button", { name: "Zusagen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Keine Verbindung/i);
  });

  it("shows a number-free message and refreshes on JOKER_CAP_EXCEEDED", async () => {
    refresh.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "JOKER_CAP_EXCEEDED" }),
      }),
    );
    render(<DashboardHero state={member()} />);
    await userEvent.click(screen.getByRole("button", { name: "Joker" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Joker setzen" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Für diese Saison sind keine Joker mehr verfügbar.",
    );
    expect(refresh).toHaveBeenCalled();
  });
});
