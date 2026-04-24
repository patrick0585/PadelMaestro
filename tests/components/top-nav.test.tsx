import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TopNav } from "@/components/top-nav";

let currentPath = "/ranking";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

describe("<TopNav>", () => {
  it("renders the brand, user-visible links, and user menu", () => {
    currentPath = "/ranking";
    render(<TopNav isAdmin={false} name="Patrick Koch" playerId="player-1" avatarVersion={0} />);
    expect(screen.getByText("Padelmaestro")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /rangliste/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /spieltag/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /admin/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /benutzermenü/i })).toHaveTextContent("PK");
  });

  it("shows the Admin link when isAdmin is true", () => {
    currentPath = "/admin";
    render(<TopNav isAdmin name="A B" playerId="player-2" avatarVersion={0} />);
    const adminLink = screen.getByRole("link", { name: /admin/i });
    expect(adminLink).toHaveAttribute("aria-current", "page");
  });
});
