import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DeletePlayerDialog } from "@/app/admin/delete-player-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe("DeletePlayerDialog", () => {
  it("spricht vom Entfernen aus der Gruppe statt vom Löschen", () => {
    render(
      <DeletePlayerDialog
        open
        onClose={() => {}}
        playerId="p"
        playerName="Olga"
        playerEmail="o@example.com"
      />,
    );
    expect(screen.getByText("Spieler entfernen — Olga")).toBeInTheDocument();
    expect(screen.getByText(/wird aus der Gruppe entfernt/)).toBeInTheDocument();
    expect(screen.getByText(/Das Konto bleibt bestehen/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entfernen" })).toBeInTheDocument();
    expect(screen.queryByText(/deaktiviert/)).not.toBeInTheDocument();
  });
});
