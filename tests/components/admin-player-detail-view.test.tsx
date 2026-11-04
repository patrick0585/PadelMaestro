import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlayerDetailView } from "@/app/admin/spieler/[id]/player-detail-view";
import type { PlayerDetail } from "@/lib/admin/player-detail";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push }) }));

const paul: PlayerDetail = {
  id: "p1",
  name: "Paul",
  email: "paul@x.de",
  username: null,
  role: "member",
  hasPassword: true,
  emailVerified: true,
  avatarVersion: 0,
  joinedAt: new Date(Date.UTC(2026, 2, 5)),
  seasonGold: 6,
  seasonPpg: 1.714,
};

describe("<PlayerDetailView>", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockClear();
  });

  it("shows header and info rows", () => {
    render(<PlayerDetailView player={paul} viewerRole="owner" />);
    expect(screen.getByRole("heading", { name: "Paul" })).toBeInTheDocument();
    expect(screen.getByText("Mitglied seit März 2026")).toBeInTheDocument();
    expect(screen.getByText("paul@x.de")).toBeInTheDocument();
    expect(screen.getByText("Mitglied")).toBeInTheDocument();
    expect(screen.getByText("6 🥇 · 1.71 PPG")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Spieler/ })).toHaveAttribute("href", "/admin/spieler");
  });

  it("shows 'Noch keine Spiele' without PPG", () => {
    render(<PlayerDetailView player={{ ...paul, seasonGold: 0, seasonPpg: null }} viewerRole="owner" />);
    expect(screen.getByText("Noch keine Spiele")).toBeInTheDocument();
  });

  it("owner target: role without action and no remove entry", () => {
    render(
      <PlayerDetailView player={{ ...paul, role: "owner" }} viewerRole="owner" />,
    );
    expect(screen.getByText("Besitzer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Rolle/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aus der Gruppe entfernen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Besitz übertragen…" })).not.toBeInTheDocument();
  });

  it("offers transfer only to an owner viewer for a target with password", () => {
    const { unmount } = render(<PlayerDetailView player={paul} viewerRole="owner" />);
    expect(screen.getByRole("button", { name: "Besitz übertragen…" })).toBeInTheDocument();
    unmount();

    const a = render(<PlayerDetailView player={paul} viewerRole="admin" />);
    expect(screen.queryByRole("button", { name: "Besitz übertragen…" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aus der Gruppe entfernen" })).toBeInTheDocument();
    a.unmount();

    render(<PlayerDetailView player={{ ...paul, hasPassword: false }} viewerRole="owner" />);
    expect(screen.queryByRole("button", { name: "Besitz übertragen…" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Passwort setzen" })).toBeInTheDocument();
  });

  it("changes the role via the picker", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(<PlayerDetailView player={paul} viewerRole="owner" />);
    await userEvent.click(screen.getByRole("button", { name: /^Rolle/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Admin/ }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/players/p1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ role: "admin" });
  });

  it("opens the edit dialog without a role field", async () => {
    render(<PlayerDetailView player={paul} viewerRole="owner" />);
    await userEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    expect(screen.getByLabelText("Anzeigename")).toHaveValue("Paul");
    expect(screen.queryByLabelText("Rolle")).not.toBeInTheDocument();
  });

  it("returns to the list after removing the player", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));
    render(<PlayerDetailView player={paul} viewerRole="owner" />);
    await userEvent.click(screen.getByRole("button", { name: "Aus der Gruppe entfernen" }));
    await userEvent.click(screen.getByRole("button", { name: "Entfernen" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/admin/spieler"));
  });
});
