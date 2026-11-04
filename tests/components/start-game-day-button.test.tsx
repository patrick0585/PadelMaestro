import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StartGameDayButton } from "@/app/admin/start-game-day-button";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function stubFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});

describe("StartGameDayButton", () => {
  it.each([
    ["too_few_players", "Für den Start werden 4–6 bestätigte Spieler benötigt."],
    ["too_many_players", "Höchstens 6 bestätigte Spieler."],
    ["already_started", "Der Spieltag läuft bereits."],
  ])("shows the message for a 409 %s", async (error, text) => {
    stubFetch(async () => Response.json({ error }, { status: 409 }));
    render(<StartGameDayButton gameDayId="d1" />);
    await userEvent.click(screen.getByRole("button", { name: "Spieltag starten" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Spieltag starten" })).toBeEnabled();
  });

  it("recovers from a rejected fetch", async () => {
    stubFetch(async () => {
      throw new Error("offline");
    });
    render(<StartGameDayButton gameDayId="d1" />);
    await userEvent.click(screen.getByRole("button", { name: "Spieltag starten" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Starten fehlgeschlagen.");
    expect(screen.getByRole("button", { name: "Spieltag starten" })).toBeEnabled();
  });

  it("refreshes on success", async () => {
    stubFetch(async () => Response.json({ gameDay: {} }));
    render(<StartGameDayButton gameDayId="d1" />);
    await userEvent.click(screen.getByRole("button", { name: "Spieltag starten" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
