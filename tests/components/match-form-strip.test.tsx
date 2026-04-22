import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MatchFormStrip } from "@/components/match-form-strip";

describe("<MatchFormStrip>", () => {
  it("renders a chip for every outcome in order", () => {
    render(<MatchFormStrip outcomes={["W", "W", "L", "D", "W"]} />);
    const chips = screen.getAllByRole("listitem");
    expect(chips).toHaveLength(5);
    expect(chips[0]).toHaveTextContent("W");
    expect(chips[2]).toHaveTextContent("L");
    expect(chips[3]).toHaveTextContent("D");
  });

  it("renders nothing when the list is empty", () => {
    const { container } = render(<MatchFormStrip outcomes={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("uses semantic aria labels on each chip", () => {
    render(<MatchFormStrip outcomes={["W", "L", "D"]} />);
    expect(screen.getByLabelText("Gewonnen")).toBeInTheDocument();
    expect(screen.getByLabelText("Verloren")).toBeInTheDocument();
    expect(screen.getByLabelText("Unentschieden")).toBeInTheDocument();
  });
});
