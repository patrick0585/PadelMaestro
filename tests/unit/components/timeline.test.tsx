import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timeline } from "@/components/ui/timeline";

describe("Timeline", () => {
  const steps = [
    { id: "a", label: "Geplant", status: "done" as const },
    { id: "b", label: "Roster", status: "current" as const },
    { id: "c", label: "Matches", status: "upcoming" as const },
    { id: "d", label: "Fertig", status: "upcoming" as const },
  ];

  it("renders a label for each step", () => {
    render(<Timeline steps={steps} />);
    expect(screen.getByText("Geplant")).toBeInTheDocument();
    expect(screen.getByText("Roster")).toBeInTheDocument();
    expect(screen.getByText("Matches")).toBeInTheDocument();
    expect(screen.getByText("Fertig")).toBeInTheDocument();
  });

  it("marks the current step with aria-current", () => {
    render(<Timeline steps={steps} />);
    const current = screen.getByText("Roster").closest("[aria-current]");
    expect(current).toHaveAttribute("aria-current", "step");
  });

  it("sets aria-label describing position and status", () => {
    render(<Timeline steps={steps} />);
    const current = screen.getByText("Roster").closest("[aria-current]");
    expect(current).toHaveAttribute("aria-label", "Schritt 2 von 4, Roster, aktuell");
  });
});
