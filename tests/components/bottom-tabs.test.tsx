import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BottomTabs } from "@/components/bottom-tabs";

let currentPath = "/ranking";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
}));

describe("<BottomTabs>", () => {
  it("renders Rangliste and Spieltag for non-admins", () => {
    currentPath = "/ranking";
    render(<BottomTabs isAdmin={false} />);
    expect(screen.getByRole("link", { name: /rangliste/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /spieltag/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /verwaltung/i })).not.toBeInTheDocument();
  });

  it("shows the Verwaltung tab when isAdmin is true", () => {
    currentPath = "/ranking";
    render(<BottomTabs isAdmin />);
    expect(screen.getByRole("link", { name: /verwaltung/i })).toBeInTheDocument();
  });

  it("marks the active tab with aria-current='page'", () => {
    currentPath = "/game-day";
    render(<BottomTabs isAdmin={false} />);
    const spieltag = screen.getByRole("link", { name: /spieltag/i });
    expect(spieltag).toHaveAttribute("aria-current", "page");
    const rangliste = screen.getByRole("link", { name: /rangliste/i });
    expect(rangliste).not.toHaveAttribute("aria-current");
  });

  it("keeps Home active on the duo overview", () => {
    currentPath = "/duos";
    render(<BottomTabs isAdmin={false} />);
    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute("aria-current", "page");
  });

  it("keeps the Verwaltung tab active on sub-pages", () => {
    currentPath = "/admin/spieler/x";
    render(<BottomTabs isAdmin />);
    expect(screen.getByRole("link", { name: /verwaltung/i })).toHaveAttribute("aria-current", "page");
  });
});
