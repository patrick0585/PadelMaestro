import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserMenu } from "@/components/user-menu";

const unregisterMock = vi.fn();
vi.mock("@/lib/push/client", () => ({
  unregisterThisDevice: () => unregisterMock(),
}));

const signOutMock = vi.fn();
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

describe("<UserMenu>", () => {
  beforeEach(() => {
    signOutMock.mockClear();
    unregisterMock.mockReset();
    unregisterMock.mockResolvedValue(undefined);
  });

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
    await waitFor(() => expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/login" }));
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });

  it("meldet das Gerät vor dem Abmelden ab", async () => {
    const order: string[] = [];
    unregisterMock.mockImplementation(async () => void order.push("unregister"));
    signOutMock.mockImplementation(() => order.push("signOut"));
    render(<UserMenu name="Patrick Koch" playerId="player-1" avatarVersion={0} />);
    await userEvent.click(screen.getByRole("button", { name: /benutzermenü/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /abmelden/i }));
    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    expect(order).toEqual(["unregister", "signOut"]);
  });
});
