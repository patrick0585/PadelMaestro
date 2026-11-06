import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

const signIn = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...a: unknown[]) => signIn(...a) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn() }) }));
const authMock = vi.fn();
vi.mock("@/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/account/apple", () => ({ needsName: async () => true }));
import LoginPage from "@/app/login/page";
import EmailLoginPage from "@/app/login/email/page";
import WelcomeNamePage from "@/app/willkommen/name/page";
import { LoginForm } from "@/app/login/login-form";
import { AppleLinkRow } from "@/app/profil/apple-link-row";
import { NO_APPLE_SCRIPT } from "@/lib/native/early-script";

beforeEach(() => signIn.mockReset());
afterEach(() => {
  delete window.Capacitor;
  document.documentElement.removeAttribute("data-no-apple");
});

describe("Landmarks", () => {
  it("Login-Start und E-Mail-Seite haben genau ein main", async () => {
    const start = render(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getAllByRole("main")).toHaveLength(1);
    start.unmount();
    render(await EmailLoginPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("Namensschritt liegt in der Shell: kein zweites main, Anzeigeschrift, Kicker", async () => {
    authMock.mockResolvedValue({ user: { id: "p1" } });
    render(await WelcomeNamePage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("main")).toBeNull();
    expect(screen.getByText("Fast fertig")).toBeInTheDocument();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.className).toContain("font-display");
    expect(h1.firstElementChild?.className).toContain("normal-case");
  });
});

describe("<LoginForm>", () => {
  it("schaltet Autokorrektur aus und verbindet den Fehler mit beiden Feldern", async () => {
    signIn.mockResolvedValue({ error: "CredentialsSignin" });
    render(<LoginForm />);
    const id = screen.getByLabelText("E-Mail oder Benutzername");
    expect(id).toHaveAttribute("autocapitalize", "none");
    expect(id).toHaveAttribute("autocorrect", "off");
    expect(id).toHaveAttribute("spellcheck", "false");
    expect(id).not.toHaveAttribute("aria-invalid");
    fireEvent.change(id, { target: { value: "a" } });
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "b" } });
    fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
    const alert = await screen.findByRole("alert");
    expect(id).toHaveAttribute("aria-invalid", "true");
    expect(id).toHaveAttribute("aria-describedby", alert.id);
  });
});

describe("<AppleLinkRow>", () => {
  it("meldet Zustandswechsel über eine Live-Region", async () => {
    const { container } = render(<AppleLinkRow linked={false} configured />);
    const region = container.querySelector("[data-apple]");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).not.toHaveAttribute("aria-busy");
  });
});

describe("Früh-Skript gegen das Apple-Flackern", () => {
  const run = () => new Function(NO_APPLE_SCRIPT)();

  it("markiert App-Builds ohne Plugin", () => {
    window.Capacitor = { isNativePlatform: () => true, Plugins: {} };
    run();
    expect(document.documentElement).toHaveAttribute("data-no-apple");
  });

  it("lässt App-Builds mit Plugin und Browser unberührt", () => {
    window.Capacitor = { isNativePlatform: () => true, Plugins: { AppleSignIn: {} } };
    run();
    expect(document.documentElement).not.toHaveAttribute("data-no-apple");
    delete window.Capacitor;
    run();
    expect(document.documentElement).not.toHaveAttribute("data-no-apple");
  });
});
