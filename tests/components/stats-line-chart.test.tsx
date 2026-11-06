import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatsLineChart, type ChartSeries } from "@/components/charts/stats-line-chart";

const series: ChartSeries[] = [
  { id: "a", name: "Anna", values: [2, 3], tone: "rest" },
  { id: "b", name: "Ben", values: [1, 1], tone: "me" },
  { id: "c", name: "Cem", values: [3, 2], tone: "rest" },
];

const hoverFirstDay = (container: HTMLElement) =>
  fireEvent.pointerDown(container.querySelector('rect[fill="transparent"]')!);

const order = () => screen.getAllByRole("listitem").map((li) => li.textContent);

describe("StatsLineChart Tooltip", () => {
  it("sortiert im Platz-Modus (invertY) aufsteigend, Platz 1 zuerst", () => {
    const { container } = render(
      <StatsLineChart series={series} xLabels={["1", "2"]} yMin={1} yMax={3} yLabel="Platz" invertY yTickStyle="rank" />,
    );
    hoverFirstDay(container);
    expect(order()).toEqual(["Ben: 1.", "Anna: 2.", "Cem: 3."]);
  });

  it("sortiert im Punkte-Modus absteigend", () => {
    const { container } = render(<StatsLineChart series={series} xLabels={["1", "2"]} yMax={3} yLabel="Punkte" />);
    hoverFirstDay(container);
    expect(order()).toEqual(["Cem: 3", "Anna: 2", "Ben: 1"]);
  });

  it("zeigt ohne Auswahl den letzten Spieltag", () => {
    render(<StatsLineChart series={series} xLabels={["1", "2"]} yMax={3} yLabel="Punkte" />);
    expect(screen.getByText("Spieltag 2")).toBeInTheDocument();
    expect(order()).toEqual(["Anna: 3", "Cem: 2", "Ben: 1"]);
  });

  it("blendet Serien ohne Wert am Tag aus", () => {
    const s: ChartSeries[] = [...series, { id: "d", name: "Dora", values: [null, 1], tone: "rest" }];
    const { container } = render(<StatsLineChart series={s} xLabels={["1", "2"]} yMax={3} yLabel="Punkte" />);
    hoverFirstDay(container);
    expect(screen.queryByText(/Dora/)).not.toBeInTheDocument();
  });
});
