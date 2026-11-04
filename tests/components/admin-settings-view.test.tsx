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
  maxJokers: 2,
  transferCandidates: [
    { id: "p2", name: "Anna" },
    { id: "p3", name: "Ben" },
  ],
};

describe("<SettingsView>", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows rules and footnote", () => {
    render(<SettingsView {...base} isOwner />);
    expect(screen.getByText("Joker pro Saison")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Spieler pro Spieltag")).toBeInTheDocument();
    expect(screen.getByText("4–6")).toBeInTheDocument();
    expect(
      screen.getByText("Regeln sind in Version 1 fest. Anpassbar kommt später."),
    ).toBeInTheDocument();
    expect(screen.getByText("padelfreunde-1a2b3c")).toBeInTheDocument();
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

  it("non-owner admin sees read-only values and no actions", () => {
    render(<SettingsView {...base} isOwner={false} />);
    expect(screen.getByText("Padelfreunde")).toBeInTheDocument();
    expect(screen.getByText("padelfreunde-1a2b3c")).toBeInTheDocument();
    expect(screen.getByText("4–6")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
