import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MobileTopBar } from "@/components/mobile-top-bar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

describe("<MobileTopBar>", () => {
  it("der Avatar führt direkt ins Profil", () => {
    render(<MobileTopBar name="Patrick Koch" playerId="player-1" avatarVersion={0} groups={[]} activeGroupId={null} />);
    const link = screen.getByRole("link", { name: "Profil" });
    expect(link).toHaveAttribute("href", "/profil");
    expect(link).toHaveTextContent("PK");
    expect(screen.queryByRole("button", { name: /benutzermenü/i })).toBeNull();
  });

  it("zeigt die Live-Leiste, solange ein Spieltag läuft", () => {
    render(
      <MobileTopBar name="A B" playerId="p" avatarVersion={0} groups={[]} activeGroupId={null} live={{ current: 6, total: 15 }} />,
    );
    const strip = screen.getByRole("link", { name: /Spieltag läuft/ });
    expect(strip).toHaveAttribute("href", "/game-day");
    expect(strip).toHaveTextContent("Match 6 von 15");
  });

  it("ohne laufenden Spieltag keine Live-Leiste", () => {
    render(<MobileTopBar name="A B" playerId="p" avatarVersion={0} groups={[]} activeGroupId={null} live={null} />);
    expect(screen.queryByRole("link", { name: /Spieltag läuft/ })).toBeNull();
  });

  it("is hidden on md and up, visible below", () => {
    const { container } = render(
      <MobileTopBar name="A B" playerId="player-2" avatarVersion={0} groups={[]} activeGroupId={null} />,
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
      <MobileTopBar name="A B" playerId="player-3" avatarVersion={0} groups={[]} activeGroupId={null} />,
    );
    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(header!.className).toContain("pt-[env(safe-area-inset-top)]");
  });

  it("renders the group switcher on the left for two groups", () => {
    render(
      <MobileTopBar
        name="A B"
        playerId="player-4"
        avatarVersion={0}
        groups={[
          { id: "g1", name: "Dienstagsrunde" },
          { id: "g2", name: "Freitagsrunde" },
        ]}
        activeGroupId="g1"
      />,
    );
    expect(screen.getByRole("button", { name: /Gruppe wechseln/ })).toHaveTextContent("Dienstagsrunde");
    expect(screen.getByRole("link", { name: "Profil" })).toBeInTheDocument();
  });
});
