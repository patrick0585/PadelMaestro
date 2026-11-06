import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GapToLeader } from "@/components/ranking/gap-to-leader";

const g = (gap: number, first = false) => ({ gap, first });

describe("GapToLeader", () => {
  it("zeigt den aktuellen Rückstand und beschriftet die Balken mit der Spieltagsnummer", () => {
    render(<GapToLeader gaps={[g(3), g(5)]} />);
    expect(screen.getByText("jetzt −5")).toBeInTheDocument();
    expect(screen.getByText("−3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAccessibleName(/jetzt −5/);
  });

  it("zeigt 'Du bist vorne' und '1.' auf Platz 1", () => {
    render(<GapToLeader gaps={[g(4), g(0, true)]} />);
    expect(screen.getByText("Du bist vorne")).toBeInTheDocument();
    expect(screen.getByText("1.")).toBeInTheDocument();
  });

  it("zeigt 'punktgleich' bei Abstand 0 ohne Platz 1", () => {
    render(<GapToLeader gaps={[g(2), g(0)]} />);
    expect(screen.getByText("punktgleich")).toBeInTheDocument();
    expect(screen.queryByText("1.")).not.toBeInTheDocument();
  });

  it("zeigt höchstens die letzten 12 Spieltage", () => {
    const gaps = Array.from({ length: 20 }, (_, i) => g(i + 1));
    render(<GapToLeader gaps={gaps} />);
    expect(screen.getByText(/^Letzte 12 Spieltage\./)).toBeInTheDocument();
    expect(screen.queryByText("8")).not.toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("rendert nichts ohne Spieltage oder ohne aktuellen Wert", () => {
    expect(render(<GapToLeader gaps={[]} />).container).toBeEmptyDOMElement();
    expect(render(<GapToLeader gaps={[g(2), null]} />).container).toBeEmptyDOMElement();
  });

  it("überspringt Tage vor dem ersten Auftritt", () => {
    render(<GapToLeader gaps={[null, g(2)]} />);
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
