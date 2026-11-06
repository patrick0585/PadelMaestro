import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DateBlock } from "@/components/date-block";

const DATE = new Date("2026-10-09T00:00:00Z");

describe("<DateBlock>", () => {
  it("zeigt Tag und Monat und spricht das volle Datum", () => {
    const { container } = render(<DateBlock date={DATE} size="md" />);
    expect(container.querySelector("[aria-hidden='true']")).toHaveTextContent("09Okt");
    expect(container.querySelector(".sr-only")).toHaveTextContent("Fr., 09.10.2026:");
  });

  it("srPrefix steht vor dem Datum", () => {
    const { container } = render(<DateBlock date={DATE} size="lg" srPrefix="Spieltag " />);
    expect(container.querySelector(".sr-only")).toHaveTextContent("Spieltag Fr., 09.10.2026:");
  });

  it("Größe bestimmt Breite und Tagesschrift", () => {
    const md = render(<DateBlock date={DATE} size="md" />).container;
    expect(md.firstElementChild).toHaveClass("w-10", "shrink-0");
    expect(md.querySelector(".text-2xl")).not.toBeNull();
    const lg = render(<DateBlock date={DATE} size="lg" />).container;
    expect(lg.firstElementChild).not.toHaveClass("w-10");
    expect(lg.querySelector(".text-\\[26px\\]")).not.toBeNull();
  });
});
