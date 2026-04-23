import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DayPpgStrip } from "@/components/day-ppg-strip";

describe("<DayPpgStrip>", () => {
  it("renders one chip per day in order with PPG rounded to one decimal", () => {
    render(
      <DayPpgStrip
        days={[
          { gameDayId: "d1", ppg: 2.345, delta: "up" },
          { gameDayId: "d2", ppg: 1, delta: "flat" },
          { gameDayId: "d3", ppg: 0.666, delta: "down" },
        ]}
      />,
    );
    const chips = screen.getAllByRole("listitem");
    expect(chips).toHaveLength(3);
    expect(chips[0]).toHaveTextContent("2.3");
    expect(chips[1]).toHaveTextContent("1.0");
    expect(chips[2]).toHaveTextContent("0.7");
  });

  it("renders nothing when the list is empty", () => {
    const { container } = render(<DayPpgStrip days={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a single chip when the list has one day", () => {
    render(<DayPpgStrip days={[{ gameDayId: "only", ppg: 1.5, delta: "flat" }]} />);
    const chips = screen.getAllByRole("listitem");
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveTextContent("1.5");
    expect(chips[0]).toHaveAttribute("aria-label", expect.stringContaining("Unverändert"));
  });

  it("applies trend-specific aria labels", () => {
    render(
      <DayPpgStrip
        days={[
          { gameDayId: "d1", ppg: 2, delta: "up" },
          { gameDayId: "d2", ppg: 1, delta: "down" },
          { gameDayId: "d3", ppg: 1, delta: "flat" },
        ]}
      />,
    );
    expect(screen.getByLabelText(/Verbessert/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Verschlechtert/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Unverändert/i)).toBeInTheDocument();
  });
});
