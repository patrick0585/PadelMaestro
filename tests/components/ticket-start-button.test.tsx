import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketStartButton } from "@/app/admin/ticket-start-button";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});

describe("TicketStartButton", () => {
  it("posts to the start endpoint and refreshes on success", async () => {
    const fetchMock = vi.fn(async () => Response.json({ gameDay: {} }));
    vi.stubGlobal("fetch", fetchMock);
    render(<TicketStartButton gameDayId="d1" />);
    await userEvent.click(screen.getByRole("button", { name: "Starten" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/game-days/d1/start", { method: "POST" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Stays disabled until the refreshed page swaps the ticket, so a second tap can't fire.
    expect(screen.getByTestId("ticket-start")).toBeDisabled();
  });

  it("shows the German message for a known error code and stays enabled", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "too_few_players" }, { status: 409 })));
    render(<TicketStartButton gameDayId="d1" />);
    await userEvent.click(screen.getByRole("button", { name: "Starten" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Für den Start werden 4–6 bestätigte Spieler benötigt.");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Starten" })).toBeEnabled();
  });

  it("falls back to a generic message for an unknown error code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "boom" }, { status: 500 })));
    render(<TicketStartButton gameDayId="d1" />);
    await userEvent.click(screen.getByRole("button", { name: "Starten" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Starten fehlgeschlagen.");
  });

  it("disables the button and shows 'Startet…' while the request is pending", async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (resolve = r))));
    render(<TicketStartButton gameDayId="d1" />);
    await userEvent.click(screen.getByRole("button", { name: "Starten" }));
    expect(screen.getByRole("button", { name: "Startet…" })).toBeDisabled();
    resolve(Response.json({ error: "already_started" }, { status: 409 }));
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Starten" })).toBeEnabled());
  });
});
