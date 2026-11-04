import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SeasonView } from "@/app/admin/saison/season-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const base = {
  name: "Saison 2026",
  startDate: new Date(Date.UTC(2026, 0, 1)),
  finishedCount: 7,
  maxJokers: 2,
};

describe("<SeasonView>", () => {
  it("shows name, start date, played days and jokers", () => {
    render(<SeasonView {...base} />);
    expect(screen.getByText("Saison 2026")).toBeInTheDocument();
    expect(screen.getByText("Seit")).toBeInTheDocument();
    expect(screen.getByText("01.01.2026")).toBeInTheDocument();
    expect(screen.getByText("Gespielte Spieltage")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Joker pro Saison")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("links back to the overview", () => {
    render(<SeasonView {...base} />);
    expect(screen.getByRole("link", { name: /Verwaltung/ })).toHaveAttribute("href", "/admin");
  });

  it("opens the close-season dialog from the red entry", async () => {
    render(<SeasonView {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Saison abschließen…" }));
    expect(screen.getByLabelText("Name der neuen Saison")).toBeInTheDocument();
  });
});
