import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LegalFooter } from "@/components/legal-footer";

describe("LegalFooter", () => {
  it("renders the three legal links without a home link by default", () => {
    render(<LegalFooter />);
    const nav = screen.getByRole("navigation", { name: "Rechtliches" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Impressum" })).toHaveAttribute("href", "/impressum");
    expect(screen.getByRole("link", { name: "Datenschutz" })).toHaveAttribute("href", "/datenschutz");
    expect(screen.getByRole("link", { name: "Nutzungsbedingungen" })).toHaveAttribute(
      "href",
      "/nutzungsbedingungen",
    );
    expect(screen.queryByRole("link", { name: "Zur Startseite" })).toBeNull();
  });

  it("adds the home link with showHome", () => {
    render(<LegalFooter showHome />);
    expect(screen.getByRole("link", { name: "Zur Startseite" })).toHaveAttribute("href", "/");
  });
});
