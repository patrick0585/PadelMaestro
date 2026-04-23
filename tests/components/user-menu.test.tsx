import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserMenu } from "@/components/user-menu";

const signOutMock = vi.fn();
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

describe("<UserMenu>", () => {
  beforeEach(() => signOutMock.mockClear());

  it("shows initials derived from the name", () => {
    render(<UserMenu name="Patrick Koch" playerId="player-1" avatarVersion={0} />);
    expect(screen.getByRole("button", { name: /benutzermenü/i })).toHaveTextContent("PK");
  });

  it("falls back to a single initial for single-word names", () => {
    render(<UserMenu name="Patrick" playerId="player-1" avatarVersion={0} />);
    expect(screen.getByRole("button", { name: /benutzermenü/i })).toHaveTextContent("P");
  });

  it("opens menu and calls signOut when clicking Abmelden", async () => {
    render(<UserMenu name="Patrick Koch" playerId="player-1" avatarVersion={0} />);
    await userEvent.click(screen.getByRole("button", { name: /benutzermenü/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /abmelden/i }));
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});
