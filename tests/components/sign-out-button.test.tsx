import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

const order: string[] = [];
vi.mock("@/lib/push/client", () => ({ unregisterThisDevice: async () => void order.push("unregister") }));
const signOutMock = vi.fn((..._a: unknown[]) => void order.push("signOut"));
vi.mock("next-auth/react", () => ({ signOut: (...a: unknown[]) => signOutMock(...a) }));
import { SignOutButton } from "@/app/profil/sign-out-button";

describe("<SignOutButton>", () => {
  it("meldet erst das Gerät für Push ab, dann die Sitzung", async () => {
    render(<ul><SignOutButton /></ul>);
    await userEvent.click(screen.getByRole("button", { name: "Abmelden" }));
    await waitFor(() => expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/login" }));
    expect(order).toEqual(["unregister", "signOut"]);
  });
});
