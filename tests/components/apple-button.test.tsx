import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const signIn = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...a: unknown[]) => signIn(...a) }));
const signInWithApple = vi.fn();
const isNativeAppleAvailable = vi.fn();
vi.mock("@/lib/native/apple-sign-in", () => ({
  signInWithApple: () => signInWithApple(),
  isNativeAppleAvailable: () => isNativeAppleAvailable(),
  isAppleCancel: (e: { code?: string } | null) => e?.code === "SIGN_IN_CANCELED",
}));
import { AppleButton } from "@/components/apple-button";

const assign = vi.fn();
const credentials = { identityToken: "tok", authorizationCode: "code", givenName: "Max", familyName: "Muster" };

function click() {
  fireEvent.click(screen.getByRole("button", { name: "Mit Apple fortfahren" }));
}

describe("<AppleButton>", () => {
  beforeEach(() => {
    signIn.mockReset();
    signInWithApple.mockReset().mockResolvedValue(credentials);
    isNativeAppleAvailable.mockReset().mockReturnValue(true);
    assign.mockReset();
    vi.stubGlobal("location", { ...window.location, assign });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("rendert nichts, wenn Apple im Gerät nicht verfügbar ist", () => {
    isNativeAppleAvailable.mockReturnValue(false);
    const { container } = render(<AppleButton label="Mit Apple fortfahren" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("meldet mit Einladungs-Token an und führt über den Namensschritt zu next", async () => {
    signIn.mockResolvedValue({ error: undefined, code: undefined });
    render(<AppleButton label="Mit Apple fortfahren" invitationToken="inv1" next="/einladung/inv1" />);
    click();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/willkommen/name?next=%2Feinladung%2Finv1"));
    expect(signIn).toHaveBeenCalledWith("apple", { ...credentials, invitationToken: "inv1", redirect: false });
  });

  it("geht ohne next zum Namensschritt ohne Parameter", async () => {
    signIn.mockResolvedValue({ error: undefined });
    render(<AppleButton label="Mit Apple fortfahren" next="//evil.example" />);
    click();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/willkommen/name"));
    expect(signIn.mock.calls[0][1]).not.toHaveProperty("invitationToken");
  });

  it.each([
    ["apple_already_linked", "Diese Apple-ID ist bereits mit einem anderen Konto verbunden."],
    ["signup_closed", "Registrierung derzeit nur mit Einladung"],
    ["invitation_invalid", "Dieser Einladungslink ist nicht mehr gültig."],
    ["unbekannt", "Die Anmeldung mit Apple hat nicht geklappt. Bitte versuche es erneut."],
  ])("zeigt für %s die deutsche Meldung", async (code, text) => {
    signIn.mockResolvedValue({ error: "CredentialsSignin", code });
    const onError = vi.fn();
    render(<AppleButton label="Mit Apple fortfahren" onError={onError} />);
    click();
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(onError).toHaveBeenCalledWith(text);
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Mit Apple fortfahren" })).toBeEnabled();
  });

  it("verschluckt den Abbruch durch die Nutzerin still", async () => {
    signInWithApple.mockRejectedValue({ code: "SIGN_IN_CANCELED" });
    render(<AppleButton label="Mit Apple fortfahren" />);
    click();
    await waitFor(() => expect(screen.getByRole("button", { name: "Mit Apple fortfahren" })).toBeEnabled());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("meldet andere Fehler des Apple-Dialogs als nicht verfügbar", async () => {
    signInWithApple.mockRejectedValue(new Error("apple_js_load"));
    render(<AppleButton label="Mit Apple fortfahren" />);
    click();
    expect(await screen.findByRole("alert")).toHaveTextContent("Anmeldung mit Apple ist gerade nicht verfügbar.");
  });
});
