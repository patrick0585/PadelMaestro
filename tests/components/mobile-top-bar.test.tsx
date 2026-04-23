import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MobileTopBar } from "@/components/mobile-top-bar";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

describe("<MobileTopBar>", () => {
  it("renders the user menu trigger with the player's initials", () => {
    render(<MobileTopBar name="Patrick Koch" playerId="player-1" avatarVersion={0} />);
    expect(screen.getByRole("button", { name: /benutzermenü/i })).toHaveTextContent("PK");
  });

  it("is hidden on md and up, visible below", () => {
    const { container } = render(
      <MobileTopBar name="A B" playerId="player-2" avatarVersion={0} />,
    );
    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(header!.className).toContain("md:hidden");
    expect(header!.className).toContain("sticky");
  });
});
