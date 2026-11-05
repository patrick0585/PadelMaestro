import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
import { AccountSection } from "@/app/profil/account-section";

describe("<AccountSection>", () => {
  it("renders the export link and the delete row that opens the dialog", () => {
    render(<AccountSection hasPassword />);
    expect(screen.getByRole("heading", { name: "Daten" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Daten exportieren" });
    expect(link).toHaveAttribute("href", "/api/profile/export");
    expect(link).toHaveAttribute("download");
    expect(screen.getByText(/deine Spielergebnisse bleiben ohne deinen Namen erhalten/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Konto löschen" }));
    expect(screen.getByRole("heading", { name: "Konto löschen" })).toBeInTheDocument();
    expect(screen.getByLabelText("Dein Passwort")).toBeInTheDocument();
  });

  it("shows the no-password hint and no delete row without a password", () => {
    render(<AccountSection hasPassword={false} />);
    expect(screen.getByRole("link", { name: "Daten exportieren" })).toHaveAttribute("download");
    expect(screen.getByText(/kann nur von einem Admin entfernt werden/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Konto löschen" })).toBeNull();
  });
});
