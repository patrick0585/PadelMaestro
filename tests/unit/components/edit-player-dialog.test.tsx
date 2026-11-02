import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EditPlayerDialog, type EditablePlayer } from "@/app/admin/edit-player-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

function player(role: EditablePlayer["role"], isAdmin: boolean): EditablePlayer {
  return { id: "p", name: "Olga", email: "o@example.com", username: null, isAdmin, role };
}

const HINT = "Der Besitzer behält immer Admin-Rechte.";

describe("EditPlayerDialog Admin-Checkbox", () => {
  it("ist für den Besitzer deaktiviert, angehakt und erklärt", () => {
    render(<EditPlayerDialog open onClose={() => {}} player={player("owner", false)} />);
    const box = screen.getByLabelText("Admin-Rechte");
    expect(box).toBeDisabled();
    expect(box).toBeChecked();
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(box).toHaveAttribute("aria-describedby", "edit-player-is-admin-hint");
  });

  it("ist für ein Mitglied aktiv und ohne Hinweis", () => {
    render(<EditPlayerDialog open onClose={() => {}} player={player("member", false)} />);
    const box = screen.getByLabelText("Admin-Rechte");
    expect(box).toBeEnabled();
    expect(box).not.toBeChecked();
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(box).not.toHaveAttribute("aria-describedby");
  });
});
