import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { SettingsView } from "@/app/admin/einstellungen/settings-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const base = {
  groupId: "g-1",
  name: "Padelfreunde",
  slug: "padelfreunde-1a2b3c",
  rules: { jokersPerSeason: 2, jokerGamesCredited: 15 },
  transferCandidates: [
    { id: "p2", name: "Anna" },
    { id: "p3", name: "Ben" },
  ],
};

describe("<SettingsView>", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows rule steppers, the fixed player range and the footnote", () => {
    render(<SettingsView {...base} isOwner />);
    expect(screen.getByText("Joker pro Saison")).toBeInTheDocument();
    expect(screen.getByText("Spiele pro Joker")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("Spieler pro Spieltag")).toBeInTheDocument();
    expect(screen.getByText("4–6")).toBeInTheDocument();
    expect(
      screen.getByText("Änderungen gelten sofort. Bereits eingesetzte Joker bleiben unverändert."),
    ).toBeInTheDocument();
    expect(screen.getByText("padelfreunde-1a2b3c")).toBeInTheDocument();
  });

  it("disables the stepper buttons at the bounds", () => {
    const { unmount } = render(
      <SettingsView {...base} isOwner rules={{ jokersPerSeason: 0, jokerGamesCredited: 1 }} />,
    );
    expect(screen.getByRole("button", { name: "Joker pro Saison verringern" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Spiele pro Joker verringern" })).toBeDisabled();
    unmount();
    render(<SettingsView {...base} isOwner rules={{ jokersPerSeason: 10, jokerGamesCredited: 30 }} />);
    expect(screen.getByRole("button", { name: "Joker pro Saison erhöhen" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Spiele pro Joker erhöhen" })).toBeDisabled();
  });

  it("saves rules only after a change and sends both values", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ jokersPerSeason: 3, jokerGamesCredited: 15 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsView {...base} isOwner={false} />);
    const save = screen.getByRole("button", { name: "Sichern" });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Joker pro Saison erhöhen" }));
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/groups/active/rules");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      groupId: "g-1",
      jokersPerSeason: 3,
      jokerGamesCredited: 15,
    });
    expect(await screen.findByText("Gespeichert.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sichern" })).toBeDisabled();
  });

  it("shows the below_used minimum", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 409,
        json: async () => ({ error: "below_used", minimum: 2 }),
      }),
    );
    render(<SettingsView {...base} isOwner={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Joker pro Saison verringern" }));
    fireEvent.click(screen.getByRole("button", { name: "Sichern" }));
    expect(
      await screen.findByText("Mindestens 2, weil schon 2 Joker eingesetzt wurden."),
    ).toBeInTheDocument();
  });

  it("owner renames with the groupId and sees the stale-group text on 409", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 409,
      json: async () => ({ error: "stale_group" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsView {...base} isOwner />);
    fireEvent.change(screen.getByLabelText("Gruppenname"), { target: { value: "Neu" } });
    fireEvent.click(screen.getByRole("button", { name: "Umbenennen" }));
    expect(
      await screen.findByText("Die aktive Gruppe hat sich geändert. Bitte die Seite neu laden."),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ groupId: "g-1", name: "Neu" });
  });

  it("owner opens the picker, then the transfer dialog for the chosen member", () => {
    render(<SettingsView {...base} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: /Besitz übertragen/ }));
    const picker = screen.getByRole("dialog");
    fireEvent.click(within(picker).getByRole("button", { name: "Ben" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Ben");
    expect(dialog).toHaveTextContent("Besitz übertragen");
    expect(screen.queryByRole("button", { name: "Anna" })).not.toBeInTheDocument();
  });

  it("owner opens the delete dialog", () => {
    render(<SettingsView {...base} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "Gruppe löschen" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("hides transfer when there is no candidate", () => {
    render(<SettingsView {...base} isOwner transferCandidates={[]} />);
    expect(screen.queryByRole("button", { name: /Besitz übertragen/ })).not.toBeInTheDocument();
  });

  it("non-owner admin can rename and edit rules but has no transfer or delete", () => {
    render(<SettingsView {...base} isOwner={false} />);
    expect(screen.getByLabelText("Gruppenname")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Umbenennen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Joker pro Saison verringern" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Besitz übertragen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gruppe löschen" })).not.toBeInTheDocument();
  });

  it("exposes each stepper as a labelled group containing its value", () => {
    render(<SettingsView {...base} isOwner />);
    const group = screen.getByRole("group", { name: "Joker pro Saison" });
    expect(within(group).getByText("2")).toBeInTheDocument();
  });
});
