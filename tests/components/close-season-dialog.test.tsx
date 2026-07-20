import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import { CloseSeasonDialog } from "@/app/admin/close-season-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("<CloseSeasonDialog>", () => {
  it("posts both names and refreshes on success", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse(200, { closedSeason: {}, newSeason: {} }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CloseSeasonDialog currentName="Saison 2026" />);
    await userEvent.click(screen.getByRole("button", { name: /Saison abschließen/ }));

    const closedInput = screen.getByLabelText("Name im Archiv");
    expect(closedInput).toHaveValue("Saison 2026");
    await userEvent.clear(closedInput);
    await userEvent.type(closedInput, "Hinrunde 2026");
    await userEvent.type(screen.getByLabelText("Name der neuen Saison"), "Rückrunde 2026");
    await userEvent.click(screen.getByRole("button", { name: "Abschließen" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/seasons/close",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ closedName: "Hinrunde 2026", nextName: "Rückrunde 2026" }),
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the blocking dates on open_game_days", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse(409, { error: "open_game_days", days: ["2026-07-21"] })),
    );

    render(<CloseSeasonDialog currentName="Saison 2026" />);
    await userEvent.click(screen.getByRole("button", { name: /Saison abschließen/ }));
    await userEvent.type(screen.getByLabelText("Name der neuen Saison"), "Rückrunde 2026");
    await userEvent.click(screen.getByRole("button", { name: "Abschließen" }));

    expect(await screen.findByText(/offene Spieltage/)).toBeInTheDocument();
    expect(screen.getByText(/21\.07\.2026/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("maps name_conflict to a German message", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(409, { error: "name_conflict" })));

    render(<CloseSeasonDialog currentName="Saison 2026" />);
    await userEvent.click(screen.getByRole("button", { name: /Saison abschließen/ }));
    await userEvent.type(screen.getByLabelText("Name der neuen Saison"), "Saison 2026 B");
    await userEvent.click(screen.getByRole("button", { name: "Abschließen" }));

    expect(await screen.findByText(/bereits vergeben/)).toBeInTheDocument();
  });
});
