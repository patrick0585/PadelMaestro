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
    expect(screen.queryByRole("link", { name: /admin/i })).not.toBeInTheDocument();
  });

  it("shows the Admin tab when isAdmin is true", () => {
    currentPath = "/ranking";
    render(<BottomTabs isAdmin />);
    expect(screen.getByRole("link", { name: /admin/i })).toBeInTheDocument();
  });

  it("marks the active tab with aria-current='page'", () => {
    currentPath = "/game-day";
    render(<BottomTabs isAdmin={false} />);
    const spieltag = screen.getByRole("link", { name: /spieltag/i });
    expect(spieltag).toHaveAttribute("aria-current", "page");
    const rangliste = screen.getByRole("link", { name: /rangliste/i });
    expect(rangliste).not.toHaveAttribute("aria-current");
  });
});
