import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LegalPage } from "@/components/legal-page";

describe("LegalPage", () => {
  it("renders title, German date and the content, without requiring a session", () => {
    render(
      <LegalPage title="Testseite" updatedAt="2026-11-03">
        <p>Inhalt hier</p>
      </LegalPage>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Testseite" })).toBeInTheDocument();
    expect(screen.getByText("Stand: 03.11.2026")).toBeInTheDocument();
    expect(screen.getByText("Inhalt hier")).toBeInTheDocument();
  });
});
