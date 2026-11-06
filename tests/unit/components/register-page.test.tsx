import { render, screen } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/auth", () => ({ auth: () => authMock() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
import RegisterPage from "@/app/registrieren/page";
import LoginPage from "@/app/login/page";

describe("Registrierung ohne Einladung", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("zeigt das Formular, wenn die Registrierung offen ist", async () => {
    vi.stubEnv("PUBLIC_SIGNUP", "true");
    authMock.mockResolvedValue(null);
    render(await RegisterPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Konto erstellen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Konto anlegen" })).toBeInTheDocument();
  });

  it("verweist auf Einladung und Hilfe, solange sie geschlossen ist", async () => {
    authMock.mockResolvedValue(null);
    render(await RegisterPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("button", { name: "Konto anlegen" })).toBeNull();
    expect(screen.getByRole("link", { name: "Zur Hilfe-Seite" })).toHaveAttribute("href", "/support");
  });

  it("schickt Angemeldete zur Startseite", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    await expect(RegisterPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/");
  });

  it("die Login-Seite zeigt den Link nur bei offener Registrierung", async () => {
    const { unmount } = render(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("link", { name: "Neu hier? Konto erstellen" })).toBeNull();
    unmount();
    vi.stubEnv("PUBLIC_SIGNUP", "true");
    render(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: "Neu hier? Konto erstellen" })).toHaveAttribute("href", "/registrieren");
  });
});
