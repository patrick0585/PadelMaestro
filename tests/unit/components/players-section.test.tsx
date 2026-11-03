import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlayersSection, type PlayerRow } from "@/app/admin/players-section";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

function row(overrides: Partial<PlayerRow> & Pick<PlayerRow, "id" | "name" | "role">): PlayerRow {
  return {
    email: `${overrides.id}@example.com`,
    username: null,
    isAdmin: overrides.role !== "member",
    hasPassword: true,
    emailVerified: true,
    avatarVersion: 0,
    ...overrides,
  };
}

const players: PlayerRow[] = [
  row({ id: "o", name: "Olga", role: "owner" }),
  row({ id: "a", name: "Armin", role: "admin" }),
  row({ id: "m", name: "Martin", role: "member" }),
];

describe("PlayersSection", () => {
  it("zeigt Badge 'Besitzer' für owner und 'Admin' für admin", () => {
    render(<PlayersSection players={players} viewerRole="owner" />);
    expect(screen.getByText("Besitzer")).toBeInTheDocument();
    expect(screen.getAllByText("Admin")).toHaveLength(1);
  });

  it("zeigt 'Unbestätigt' nur bei Passwort und unbestätigter Adresse", () => {
    render(
      <PlayersSection
        players={[
          row({ id: "u", name: "Uwe", role: "member", emailVerified: false }),
          row({ id: "s", name: "Stats", role: "member", emailVerified: false, hasPassword: false }),
          row({ id: "v", name: "Vera", role: "member" }),
        ]}
        viewerRole="owner"
      />,
    );
    expect(screen.getAllByText("Unbestätigt")).toHaveLength(1);
  });

  it("blendet den Löschen-Button für den Besitzer aus", () => {
    render(<PlayersSection players={players} viewerRole="owner" />);
    expect(screen.queryByLabelText("Spieler Olga löschen")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Spieler Martin löschen")).toBeInTheDocument();
  });

  it("zeigt 'Besitz übertragen' nur dem Besitzer und nicht in seiner eigenen Zeile", () => {
    const { unmount } = render(<PlayersSection players={players} viewerRole="owner" />);
    expect(screen.getByLabelText("Besitz übertragen an Armin")).toBeInTheDocument();
    expect(screen.getByLabelText("Besitz übertragen an Martin")).toBeInTheDocument();
    expect(screen.queryByLabelText("Besitz übertragen an Olga")).not.toBeInTheDocument();
    unmount();

    render(<PlayersSection players={players} viewerRole="admin" />);
    expect(screen.queryByText("Besitz übertragen")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Besitz übertragen/)).not.toBeInTheDocument();
  });
});
