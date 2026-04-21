import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "@/components/ui/badge";

describe("<Badge>", () => {
  it("renders children", () => {
    render(<Badge>Admin</Badge>);
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("uses primary variant styling by default", () => {
    render(<Badge>Aktiv</Badge>);
    expect(screen.getByText("Aktiv").className).toMatch(/bg-primary-soft/);
  });

  it("uses neutral variant styling when requested", () => {
    render(<Badge variant="neutral">#3</Badge>);
    expect(screen.getByText("#3").className).toMatch(/bg-surface-muted/);
  });
});
