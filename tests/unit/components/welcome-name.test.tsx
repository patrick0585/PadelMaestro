import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/auth", () => ({ auth: () => authMock() }));
const needsNameMock = vi.fn();
vi.mock("@/lib/account/apple", () => ({ needsName: (id: string) => needsNameMock(id) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
import WelcomeNamePage from "@/app/willkommen/name/page";
import { NameForm } from "@/app/willkommen/name/name-form";

const page = (next?: string) => WelcomeNamePage({ searchParams: Promise.resolve(next ? { next } : {}) });

describe("Namensschritt (Seite)", () => {
  beforeEach(() => {
    authMock.mockReset().mockResolvedValue({ user: { id: "p1" } });
    needsNameMock.mockReset().mockResolvedValue(true);
  });

  it("zeigt Frage und Formular, solange ein Name fehlt", async () => {
    render(await page());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Wie sollen dich deine Mitspieler sehen?");
    expect(screen.getByLabelText("Dein Name")).toBeInTheDocument();
  });

  it("schickt Anonyme zum Login", async () => {
    authMock.mockResolvedValue(null);
    await expect(page()).rejects.toThrow("REDIRECT:/login");
  });

  it("springt weiter, wenn kein Name mehr fehlt (kein Schleifen)", async () => {
    needsNameMock.mockResolvedValue(false);
    await expect(page("/einladung/abc")).rejects.toThrow("REDIRECT:/einladung/abc");
    await expect(page("//evil.example")).rejects.toThrow("REDIRECT:/");
  });
});

describe("<NameForm>", () => {
  const assign = vi.fn();
  beforeEach(() => {
    assign.mockReset();
    vi.stubGlobal("location", { ...window.location, assign });
  });
  afterEach(() => vi.unstubAllGlobals());

  function submit(name: string) {
    fireEvent.change(screen.getByLabelText("Dein Name"), { target: { value: name } });
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
  }

  it("hält Weiter ohne Eingabe gesperrt", () => {
    render(<NameForm />);
    expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled();
  });

  it("speichert den getrimmten Namen und geht zu next", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 204 });
    vi.stubGlobal("fetch", fetchMock);
    render(<NameForm next="/gruppe/neu" />);
    submit("  Max Muster ");
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/gruppe/neu"));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/profile/name");
    expect(JSON.parse(init.body)).toEqual({ name: "Max Muster" });
  });

  it("geht ohne next zur Startseite", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 204 }));
    render(<NameForm />);
    submit("Max");
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });

  it("meldet 400 und andere Fehler", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 400 }));
    const { unmount } = render(<NameForm />);
    submit("Max");
    expect(await screen.findByRole("alert")).toHaveTextContent("höchstens 60 Zeichen");
    expect(assign).not.toHaveBeenCalled();
    unmount();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<NameForm />);
    submit("Max");
    expect(await screen.findByRole("alert")).toHaveTextContent("Speichern fehlgeschlagen");
  });
});
