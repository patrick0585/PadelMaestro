import { render, screen } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
import LoginPage from "@/app/login/page";
import EmailLoginPage from "@/app/login/email/page";

function configureApple() {
  vi.stubEnv("APPLE_TEAM_ID", "TEAM");
  vi.stubEnv("APPLE_KEY_ID", "KEY");
  vi.stubEnv("APPLE_BUNDLE_ID", "de.padelmaestro.app");
  vi.stubEnv("APPLE_SERVICES_ID", "de.padelmaestro.web");
  vi.stubEnv("APPLE_PRIVATE_KEY", "pem");
}

async function renderStart(next?: string) {
  return render(await LoginPage({ searchParams: Promise.resolve(next ? { next } : {}) }));
}

const appleButton = () => screen.queryByRole("button", { name: "Mit Apple fortfahren" });
const mailLink = () => screen.getByRole("link", { name: "Mit E-Mail anmelden" });

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.Capacitor;
});

describe("Login-Startseite", () => {
  it("zeigt Headline, Apple-Knopf und E-Mail als Zweitknopf, wenn Apple eingerichtet ist", async () => {
    configureApple();
    await renderStart();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Spielen.Eintragen.Aufsteigen.");
    expect(appleButton()).toBeInTheDocument();
    expect(mailLink()).toHaveAttribute("href", "/login/email");
    expect(mailLink().className).toContain("border");
    expect(screen.getByText(/Mit Apple fortfahren akzeptierst du/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nutzungsbedingungen" })).toHaveAttribute("href", "/nutzungsbedingungen");
    expect(screen.getByRole("link", { name: "Datenschutzerklärung" })).toHaveAttribute("href", "/datenschutz");
  });

  it("blendet Apple aus und macht E-Mail zum Hauptknopf, wenn Apple nicht eingerichtet ist", async () => {
    await renderStart();
    expect(appleButton()).toBeNull();
    expect(mailLink().className).toContain("cta-gradient");
  });

  it("blendet Apple in der App ohne Plugin aus", async () => {
    configureApple();
    window.Capacitor = { isNativePlatform: () => true, Plugins: {} };
    await renderStart();
    expect(appleButton()).toBeNull();
    expect(mailLink().className).toContain("cta-gradient");
  });

  it("zeigt Apple in der App mit Plugin", async () => {
    configureApple();
    window.Capacitor = { isNativePlatform: () => true, Plugins: { AppleSignIn: {} } };
    await renderStart();
    expect(appleButton()).toBeInTheDocument();
  });

  it("zeigt 'Konto erstellen' nur bei offener Registrierung", async () => {
    const first = await renderStart();
    expect(screen.queryByRole("link", { name: "Neu hier? Konto erstellen" })).toBeNull();
    first.unmount();
    vi.stubEnv("PUBLIC_SIGNUP", "true");
    await renderStart();
    expect(screen.getByRole("link", { name: "Neu hier? Konto erstellen" })).toHaveAttribute("href", "/registrieren");
  });

  it("gibt next an alle Links weiter und verwirft unsichere Werte", async () => {
    vi.stubEnv("PUBLIC_SIGNUP", "true");
    const first = await renderStart("/einladung/abc");
    expect(mailLink()).toHaveAttribute("href", "/login/email?next=%2Feinladung%2Fabc");
    expect(screen.getByRole("link", { name: "Neu hier? Konto erstellen" })).toHaveAttribute(
      "href",
      "/registrieren?next=%2Feinladung%2Fabc",
    );
    first.unmount();
    await renderStart("//evil.example");
    expect(mailLink()).toHaveAttribute("href", "/login/email");
  });
});

describe("E-Mail-Anmeldung", () => {
  it("zeigt das Formular, Zurück-Link und Passwort-vergessen mit next", async () => {
    render(await EmailLoginPage({ searchParams: Promise.resolve({ next: "/gruppe/neu" }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Willkommen zurück");
    expect(screen.getByRole("link", { name: "Zurück" })).toHaveAttribute("href", "/login?next=%2Fgruppe%2Fneu");
    expect(screen.getByLabelText("E-Mail oder Benutzername")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Passwort vergessen?" })).toHaveAttribute("href", "/passwort-vergessen");
    expect(screen.getByRole("button", { name: "Anmelden" })).toBeInTheDocument();
  });
});
