import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";
import { beforeEach } from "vitest";
import { ParticipantsRoster, type RosterRow } from "@/app/admin/participants-roster";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function row(overrides: Partial<RosterRow> = {}): RosterRow {
  return {
    playerId: "p1",
    name: "Werner",
    attendance: "pending",
    jokersRemaining: 2,
    ...overrides,
  };
}

describe("<ParticipantsRoster>", () => {
  it("renders a Joker badge when the player's attendance is joker", () => {
    render(<ParticipantsRoster gameDayId="gd-1" participants={[row({ attendance: "joker" })]} />);
    expect(screen.getByText("Joker")).toBeInTheDocument();
  });

  it("pool rows without a joker and with jokers remaining show a set-joker button", () => {
    render(<ParticipantsRoster gameDayId="gd-1" participants={[row()]} />);
    expect(screen.getByRole("button", { name: /Joker für Werner setzen/ })).toBeInTheDocument();
  });

  it("pool rows with no jokers remaining show a disabled 'Keine Joker übrig' button", () => {
    render(
      <ParticipantsRoster
        gameDayId="gd-1"
        participants={[row({ jokersRemaining: 0 })]}
      />,
    );
    expect(screen.getByRole("button", { name: /Keine Joker übrig/ })).toBeDisabled();
  });

  it("joker rows show a remove-joker button", () => {
    render(
      <ParticipantsRoster
        gameDayId="gd-1"
        participants={[row({ attendance: "joker" })]}
      />,
    );
    expect(screen.getByRole("button", { name: /Joker entfernen/ })).toBeInTheDocument();
  });
});

describe("<ParticipantsRoster> admin joker actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens the confirm dialog and POSTs the admin joker route on confirm", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal("fetch", fetchSpy);
    render(<ParticipantsRoster gameDayId="gd-1" participants={[row()]} />);
    await userEvent.click(screen.getByRole("button", { name: /Joker für Werner setzen/ }));
    expect(await screen.findByRole("dialog", { name: /Joker für Werner setzen/ })).toBeInTheDocument();
    await userEvent.click(
      (await screen.findAllByRole("button", { name: "Joker setzen" }))[0],
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/game-days/gd-1/participants/p1/joker");
    expect(init.method).toBe("POST");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /Joker für Werner setzen/ })).not.toBeInTheDocument(),
    );
  });

  it("DELETEs the admin joker route when 'Joker entfernen' is confirmed", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <ParticipantsRoster
        gameDayId="gd-1"
        participants={[row({ attendance: "joker" })]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Joker entfernen/ }));
    await userEvent.click(screen.getByRole("button", { name: /Ja, entfernen/ }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/game-days/gd-1/participants/p1/joker");
    expect(init.method).toBe("DELETE");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /Joker von Werner entfernen/ })).not.toBeInTheDocument(),
    );
  });
});
