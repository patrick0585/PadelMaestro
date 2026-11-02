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
    render(<PlayersSection players={players} />);
    expect(screen.getByText("Besitzer")).toBeInTheDocument();
    expect(screen.getAllByText("Admin")).toHaveLength(1);
  });

  it("blendet den Löschen-Button für den Besitzer aus", () => {
    render(<PlayersSection players={players} />);
    expect(screen.queryByLabelText("Spieler Olga löschen")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Spieler Martin löschen")).toBeInTheDocument();
  });
});
