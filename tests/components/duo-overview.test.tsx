import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DuoOverview } from "@/components/duos/duo-overview";

const p = (name: string, pointsTogether: number, matches: number, wins: number) => ({
  playerId: name,
  name,
  avatarVersion: 0,
  pointsTogether,
  matches,
  wins,
});

describe("DuoOverview", () => {
  const partners = [p("Eva", 19, 8, 6), p("Clara", 18, 9, 6), p("Daniel", 7, 8, 2), p("Anna", 3, 1, 1)];

  it("listet Partner ab 3 Matches mit Platz, Schnitt, Siegquote; markiert Bestes und Schlechtestes", () => {
    render(<DuoOverview partners={partners} bestId="Eva" worstId="Daniel" />);
    const ranked = within(screen.getByRole("list", { name: "Partner" })).getAllByRole("listitem");
    expect(ranked).toHaveLength(3);
    expect(ranked[0]).toHaveTextContent("1");
    expect(ranked[0]).toHaveTextContent("Eva");
    expect(ranked[0]).toHaveTextContent("2.4");
    expect(ranked[0]).toHaveTextContent("8 Matches · 75% Siege · 19 Pkt");
    expect(ranked[0]).toHaveTextContent("Bestes Duo");
    expect(ranked[2]).toHaveTextContent("Weniger Glück");
  });

  it("Partner unter 3 Matches stehen abgesetzt ohne Platz", () => {
    render(<DuoOverview partners={partners} bestId="Eva" worstId="Daniel" />);
    const low = within(screen.getByRole("list", { name: "Unter 3 gemeinsamen Matches" })).getAllByRole("listitem");
    expect(low).toHaveLength(1);
    expect(low[0]).toHaveTextContent("Anna");
    expect(low[0]).toHaveTextContent("1 Match · 100% Siege · 3 Pkt");
  });

  it("niemand mit 3 Matches: alle Partner als Rangliste, ohne abgesetzten Bereich", () => {
    const early = [p("Zoe", 3, 1, 1), p("Paul", 4, 2, 1), p("Lena", 0, 2, 0)];
    render(<DuoOverview partners={early} bestId="Zoe" worstId="Lena" />);
    const ranked = within(screen.getByRole("list", { name: "Partner" })).getAllByRole("listitem");
    expect(ranked.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Bestes Duo"),
      expect.stringContaining("Paul"),
      expect.stringContaining("Weniger Glück"),
    ]);
    expect(ranked[0]).toHaveTextContent("1 Match · 100% Siege · 3 Pkt");
    expect(ranked[2]).toHaveTextContent("0% Siege");
    expect(screen.queryByRole("list", { name: /Unter 3/ })).not.toBeInTheDocument();
  });

  it("Balken skalieren nur über die Rangliste", () => {
    const { container } = render(
      <DuoOverview partners={[p("Eva", 9, 3, 2), p("Ben", 6, 3, 1), p("Anna", 4, 1, 1)]} bestId="Eva" worstId="Ben" />,
    );
    const bars = [...container.querySelectorAll<HTMLElement>("li i")].map((i) => i.style.width);
    expect(bars).toEqual(["100%", expect.stringMatching(/^66\.6/)]);
  });

  it("ohne Partner ein Hinweis", () => {
    render(<DuoOverview partners={[]} bestId={null} worstId={null} />);
    expect(screen.getByText(/Noch keine gemeinsamen Matches/)).toBeInTheDocument();
  });
});
