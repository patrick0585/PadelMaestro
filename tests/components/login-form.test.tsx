import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const signIn = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...a: unknown[]) => signIn(...a) }));
import { LoginForm } from "@/app/login/login-form";

const assign = vi.fn();

function login() {
  render(<LoginForm />);
  fireEvent.change(screen.getByLabelText("E-Mail oder Benutzername"), { target: { value: "maxi" } });
  fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "geheim123" } });
  fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
}

describe("<LoginForm>", () => {
  beforeEach(() => {
    signIn.mockReset();
    assign.mockReset();
    vi.stubGlobal("location", { ...window.location, assign });
    window.sessionStorage.setItem("email-notice-dismissed", "1");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it("clears the notice dismissal after a successful login", async () => {
    signIn.mockResolvedValue({ error: undefined });
    login();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    expect(window.sessionStorage.getItem("email-notice-dismissed")).toBeNull();
  });

  it("keeps the dismissal when the login fails", async () => {
    signIn.mockResolvedValue({ error: "CredentialsSignin" });
    login();
    expect(await screen.findByText("Falsche Anmeldedaten")).toBeTruthy();
    expect(window.sessionStorage.getItem("email-notice-dismissed")).toBe("1");
    expect(assign).not.toHaveBeenCalled();
  });
});
