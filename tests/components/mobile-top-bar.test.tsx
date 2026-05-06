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

  // Regression guard: in iOS PWA standalone mode the root layout sets
  // viewportFit=cover, which paints the page under the notch / Dynamic
  // Island. Without safe-area-inset-top padding the avatar is covered
  // and only reachable in landscape (real user complaint, 2026-05-06).
  it("pads its top by env(safe-area-inset-top) so the avatar clears the iOS notch", () => {
    const { container } = render(
      <MobileTopBar name="A B" playerId="player-3" avatarVersion={0} />,
    );
    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(header!.className).toContain("pt-[env(safe-area-inset-top)]");
  });
});
