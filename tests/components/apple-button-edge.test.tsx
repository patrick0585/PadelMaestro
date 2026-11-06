import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const signIn = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...a: unknown[]) => signIn(...a) }));
const signInWithApple = vi.fn();
vi.mock("@/lib/native/apple-sign-in", () => ({
  signInWithApple: () => signInWithApple(),
  isNativeAppleAvailable: () => true,
  isAppleCancel: (e: { code?: string } | null) => e?.code === "SIGN_IN_CANCELED",
}));
import { AppleButton } from "@/components/apple-button";

const assign = vi.fn();
const NAME = "Mit Apple fortfahren";
const click = () => fireEvent.click(screen.getByRole("button", { name: /Apple fortfahren|Einen Moment/ }));

describe("<AppleButton>: Randfälle", () => {
  beforeEach(() => {
    signIn.mockReset();
    signInWithApple.mockReset().mockResolvedValue({ identityToken: "tok" });
    assign.mockReset();
    vi.stubGlobal("location", { ...window.location, assign });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sperrt den Knopf während der Anmeldung und startet sie nur einmal", async () => {
    let finish!: (v: unknown) => void;
    signIn.mockReturnValue(new Promise((r) => (finish = r)));
    render(<AppleButton label={NAME} />);
    click();
    const busy = await screen.findByRole("button", { name: "Einen Moment …" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).not.toBeDisabled();
    fireEvent.click(busy);
    finish({ error: undefined });
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(signInWithApple).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("zeigt die Standardmeldung, wenn signIn kein Ergebnis liefert", async () => {
    signIn.mockResolvedValue(undefined);
    render(<AppleButton label={NAME} />);
    click();
    expect(await screen.findByRole("alert")).toHaveTextContent("Die Anmeldung mit Apple hat nicht geklappt.");
    expect(assign).not.toHaveBeenCalled();
  });

  it("meldet nicht verfügbar, wenn signIn selbst wirft", async () => {
    signIn.mockRejectedValue(new Error("network"));
    render(<AppleButton label={NAME} />);
    click();
    expect(await screen.findByRole("alert")).toHaveTextContent("gerade nicht verfügbar");
    expect(screen.getByRole("button", { name: NAME })).toBeEnabled();
  });

  it("löscht die alte Fehlermeldung beim erneuten Versuch und meldet null an onError", async () => {
    signIn.mockResolvedValueOnce({ error: "CredentialsSignin", code: "signup_closed" });
    const onError = vi.fn();
    render(<AppleButton label={NAME} onError={onError} />);
    click();
    await screen.findByRole("alert");
    signIn.mockResolvedValueOnce({ error: undefined });
    click();
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(onError).toHaveBeenCalledWith(null);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("verbindet Fehlermeldung und Knopf über aria-describedby", async () => {
    signIn.mockResolvedValue({ error: "x", code: "apple_already_linked" });
    render(<AppleButton label={NAME} />);
    click();
    const alert = await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: NAME })).toHaveAttribute("aria-describedby", alert.id);
  });
});
