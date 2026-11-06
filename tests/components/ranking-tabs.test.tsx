import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { parseRankingView, RankingTabs } from "@/components/ranking/ranking-tabs";

describe("parseRankingView", () => {
  it("accepts known views and falls back to the table", () => {
    expect(parseRankingView("verlauf")).toBe("verlauf");
    expect(parseRankingView("duos")).toBe("duos");
    expect(parseRankingView("quatsch")).toBe("tabelle");
    expect(parseRankingView(undefined)).toBe("tabelle");
    expect(parseRankingView(["duos", "verlauf"])).toBe("tabelle");
  });
});

describe("RankingTabs", () => {
  it("links each view and marks the active one", () => {
    render(<RankingTabs active="verlauf" />);
    expect(screen.getByRole("link", { name: "Tabelle" })).toHaveAttribute("href", "/ranking");
    expect(screen.getByRole("link", { name: "Duos" })).toHaveAttribute("href", "/ranking?ansicht=duos");
    expect(screen.getByRole("link", { name: "Verlauf" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Tabelle" })).not.toHaveAttribute("aria-current");
  });
});
