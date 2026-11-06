import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import SupportPage from "@/app/support/page";

describe("Support-Seite", () => {
  it("nennt Kontakt, Konto löschen und Passwort zurücksetzen", () => {
    render(<SupportPage />);
    expect(screen.getByRole("heading", { name: "Hilfe & Support" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "kowalik.patrick@shoogee.com" })).toHaveAttribute("href", "mailto:kowalik.patrick@shoogee.com");
    expect(screen.getByRole("heading", { name: /Konto löschen/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Passwort vergessen/ })).toBeInTheDocument();
  });
});
