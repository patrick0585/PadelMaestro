import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlannedSection, type PlannedParticipant } from "@/app/game-day/planned-section";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const me: PlannedParticipant = { playerId: "me", name: "Me", attendance: "pending" };
const participants: PlannedParticipant[] = [me];

describe("<PlannedSection> attendance error handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the ATTENDANCE_LOCKED message when the server returns 409", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "ATTENDANCE_LOCKED" }),
      }),
    );
    render(<PlannedSection gameDayId="gd-1" me={me} participants={participants} />);
    await userEvent.click(screen.getByRole("button", { name: "Dabei" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Spieltag ist bereits gestartet/i);
  });

  it("shows the ATTENDANCE_NOT_PARTICIPANT message when the server returns 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ code: "ATTENDANCE_NOT_PARTICIPANT" }),
      }),
    );
    render(<PlannedSection gameDayId="gd-1" me={me} participants={participants} />);
    await userEvent.click(screen.getByRole("button", { name: "Nicht dabei" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/nicht Teilnehmer/i);
  });

  it("shows the ATTENDANCE_GAME_DAY_NOT_FOUND message when the server returns 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: "ATTENDANCE_GAME_DAY_NOT_FOUND" }),
      }),
    );
    render(<PlannedSection gameDayId="gd-1" me={me} participants={participants} />);
    await userEvent.click(screen.getByRole("button", { name: "Weiß nicht" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/existiert nicht mehr/i);
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
    render(<PlannedSection gameDayId="gd-1" me={me} participants={participants} />);
    await userEvent.click(screen.getByRole("button", { name: "Dabei" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Teilnahme konnte nicht gespeichert werden/i);
    expect(alert).toHaveTextContent(/500/);
    expect(alert).toHaveTextContent(/abmelden und neu anmelden/i);
  });

  it("suggests re-login on a bare 403 with no error code (CSRF/session)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({}),
      }),
    );
    render(<PlannedSection gameDayId="gd-1" me={me} participants={participants} />);
    await userEvent.click(screen.getByRole("button", { name: "Dabei" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/403/);
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
    render(<PlannedSection gameDayId="gd-1" me={me} participants={participants} />);
    await userEvent.click(screen.getByRole("button", { name: "Dabei" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Sitzung ist abgelaufen/i);
  });

  it("shows a connection error when fetch rejects (network drop)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<PlannedSection gameDayId="gd-1" me={me} participants={participants} />);
    await userEvent.click(screen.getByRole("button", { name: "Dabei" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Keine Verbindung/i);
  });
});
