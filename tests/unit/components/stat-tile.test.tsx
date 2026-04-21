import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatTile } from "@/components/ui/stat-tile";

describe("StatTile", () => {
  it("renders label and value", () => {
    render(<StatTile label="Dein PPG" value="1.95" />);
    expect(screen.getByText("Dein PPG")).toBeInTheDocument();
    expect(screen.getByText("1.95")).toBeInTheDocument();
  });

  it("renders hint text when provided", () => {
    render(<StatTile label="Rang" value="#3" hint="von 8 Spielern" />);
    expect(screen.getByText("von 8 Spielern")).toBeInTheDocument();
  });

  it("renders dash when value is null", () => {
    render(<StatTile label="Dein PPG" value={null} />);
    expect(screen.getByText("–")).toBeInTheDocument();
  });
});
