import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DashboardHero, type HeroState } from "@/app/dashboard-hero";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function member(overrides: Partial<Extract<HeroState, { kind: "member" }>> = {}): HeroState {
  return {
    kind: "member",
    gameDayId: "gd-1",
    date: "2026-04-30T18:00:00.000Z",
    confirmed: 3,
    total: 6,
    attendance: "pending",
    jokersRemaining: 2,
    ppgSnapshot: 1.64,
    ...overrides,
  };
}

describe("<DashboardHero> (member)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));
  });

  it("renders three toggle buttons labelled Dabei sein / Nicht dabei / Joker setzen", () => {
    render(<DashboardHero state={member()} />);
    expect(screen.getByRole("button", { name: "Dabei sein" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nicht dabei" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Joker setzen" })).toBeInTheDocument();
  });

  it("marks the active choice with aria-pressed=true", () => {
    render(<DashboardHero state={member({ attendance: "confirmed" })} />);
    expect(screen.getByRole("button", { name: "Dabei sein" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Nicht dabei" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Joker setzen" })).toHaveAttribute("aria-pressed", "false");
  });

  it("marks no button active when attendance is pending", () => {
    render(<DashboardHero state={member({ attendance: "pending" })} />);
    expect(screen.getByRole("button", { name: "Dabei sein" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Nicht dabei" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Joker setzen" })).toHaveAttribute("aria-pressed", "false");
  });

  it("marks Nicht dabei active when attendance is declined", () => {
    render(<DashboardHero state={member({ attendance: "declined" })} />);
    expect(screen.getByRole("button", { name: "Dabei sein" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Nicht dabei" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Joker setzen" })).toHaveAttribute("aria-pressed", "false");
  });

  it("marks Joker setzen active when attendance is joker", () => {
    render(<DashboardHero state={member({ attendance: "joker" })} />);
    expect(screen.getByRole("button", { name: "Dabei sein" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Nicht dabei" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Joker setzen" })).toHaveAttribute("aria-pressed", "true");
  });

  it("disables Joker setzen when no jokers are remaining and shows helper text", () => {
    render(<DashboardHero state={member({ jokersRemaining: 0 })} />);
    expect(screen.getByRole("button", { name: "Joker setzen" })).toBeDisabled();
    expect(screen.getByText(/Keine Joker mehr in dieser Saison/)).toBeInTheDocument();
  });

  it("opens the confirm dialog when Joker setzen is clicked", async () => {
    render(<DashboardHero state={member()} />);
    await userEvent.click(screen.getByRole("button", { name: "Joker setzen" }));
    expect(await screen.findByRole("dialog", { name: /Joker einsetzen/ })).toBeInTheDocument();
  });

  it("POSTs /api/jokers after confirming the dialog", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal("fetch", fetchSpy);
    render(<DashboardHero state={member()} />);
    await userEvent.click(screen.getByRole("button", { name: "Joker setzen" }));
    await userEvent.click(
      (await screen.findAllByRole("button", { name: "Joker setzen" }))[1],
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
    await userEvent.click(screen.getByRole("button", { name: "Dabei sein" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/jokers");
    expect(fetchSpy.mock.calls[0][1].method).toBe("DELETE");
    expect(fetchSpy.mock.calls[1][0]).toBe("/api/game-days/gd-1/attendance");
    expect(fetchSpy.mock.calls[1][1].method).toBe("POST");
  });

  it("does not render the time in the header", () => {
    render(<DashboardHero state={member()} />);
    expect(screen.queryByText(/^\d{2}:\d{2}$/)).not.toBeInTheDocument();
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
    await userEvent.click(screen.getByRole("button", { name: "Dabei sein" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Nicht dabei" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /nicht Teilnehmer/i,
    );
  });

  it("shows a generic error when the server returns 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      }),
    );
    render(<DashboardHero state={member()} />);
    await userEvent.click(screen.getByRole("button", { name: "Dabei sein" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Teilnahme konnte nicht gespeichert werden/i,
    );
  });
});
