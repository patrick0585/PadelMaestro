import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
import { AccountSection } from "@/app/profil/account-section";

describe("<AccountSection>", () => {
  it("renders the export link with download attribute and the delete trigger; shows the no-password hint instead when hasPassword is false", () => {
    const { unmount } = render(<AccountSection hasPassword />);
    expect(screen.getByRole("heading", { name: "Konto" })).toBeInTheDocument();
    expect(
      screen.getByText("Lade alle deine Daten als JSON herunter oder lösche dein Konto."),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Daten exportieren" });
    expect(link).toHaveAttribute("href", "/api/profile/export");
    expect(link).toHaveAttribute("download");
    expect(
      screen.getByText(
        "Löscht dein Konto und entfernt dich aus allen Gruppen. Spielergebnisse bleiben anonym erhalten.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Konto löschen" }));
    expect(screen.getByRole("heading", { name: "Konto löschen" })).toBeInTheDocument();
    expect(screen.getByLabelText("Dein Passwort")).toBeInTheDocument();
    unmount();

    render(<AccountSection hasPassword={false} />);
    expect(screen.getByRole("link", { name: "Daten exportieren" })).toHaveAttribute("download");
    expect(
      screen.getByText("Dieses Konto hat kein Passwort und kann nur von einem Admin entfernt werden."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Konto löschen" })).toBeNull();
  });
});
