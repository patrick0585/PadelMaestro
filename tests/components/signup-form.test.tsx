import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const signIn = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...a: unknown[]) => signIn(...a) }));
import { SignupForm } from "@/app/einladung/[token]/signup-form";

const assign = vi.fn();
const LOGIN_HREF = "/login?next=%2Feinladung%2Ftok1";

function stubFetch(status: number, body: unknown = {}) {
  const fn = vi.fn().mockResolvedValue({ status, json: async () => body });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function fill({ accept = true } = {}) {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Maxi" } });
  fireEvent.change(screen.getByLabelText("E-Mail-Adresse"), { target: { value: "maxi@x.de" } });
  fireEvent.change(screen.getByLabelText("Passwort (min. 8 Zeichen)"), { target: { value: "geheim123" } });
  if (accept) fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Konto anlegen" }));
}

describe("<SignupForm>", () => {
  beforeEach(() => {
    signIn.mockReset();
    assign.mockReset();
    vi.stubGlobal("location", { ...window.location, assign });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("submits name, email, password, acceptTerms true and the token, then signs in and navigates to / for member links", async () => {
    const fn = stubFetch(201, { playerId: "p1", kind: "member", groupId: "g1" });
    signIn.mockResolvedValue({ error: undefined });
    render(<SignupForm token="tok1" kind="member" />);
    fill();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("/api/signup");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      token: "tok1",
      name: "Maxi",
      email: "maxi@x.de",
      password: "geheim123",
      acceptTerms: true,
    });
    expect(signIn).toHaveBeenCalledWith("credentials", {
      identifier: "maxi@x.de",
      password: "geheim123",
      redirect: false,
    });
    expect(screen.getByRole("link", { name: "Nutzungsbedingungen" }).getAttribute("href")).toBe("/nutzungsbedingungen");
    expect(screen.getByRole("link", { name: "Datenschutzerklärung" }).getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("link", { name: "Schon ein Konto? Anmelden" }).getAttribute("href")).toBe(LOGIN_HREF);
  });

  it("navigates to /gruppe/neu after signup on a founder link", async () => {
    stubFetch(201, { playerId: "p1", kind: "founder", groupId: null });
    signIn.mockResolvedValue({ error: undefined });
    render(<SignupForm token="tok1" kind="founder" />);
    fill();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/gruppe/neu"));
  });

  it("falls back to the login page when signIn fails after signup", async () => {
    stubFetch(201, { playerId: "p1", kind: "member", groupId: "g1" });
    signIn.mockResolvedValue({ error: "CredentialsSignin" });
    render(<SignupForm token="tok1" kind="member" />);
    fill();
    await waitFor(() => expect(assign).toHaveBeenCalledWith(LOGIN_HREF));
  });

  it("shows the login hint with next link on 409", async () => {
    stubFetch(409, { error: "email_taken" });
    render(<SignupForm token="tok1" kind="member" />);
    fill();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Zu dieser Adresse gibt es schon ein Konto, bitte anmelden.");
    expect(alert.querySelector("a")?.getAttribute("href")).toBe(LOGIN_HREF);
    expect(signIn).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows the invalid-link copy on 410", async () => {
    stubFetch(410, { error: "invitation_invalid" });
    render(<SignupForm token="tok1" kind="member" />);
    fill();
    expect((await screen.findByRole("alert")).textContent).toBe("Dieser Link ist nicht mehr gültig.");
  });

  it("shows the rate-limit copy on 429", async () => {
    stubFetch(429);
    render(<SignupForm token="tok1" kind="member" />);
    fill();
    expect((await screen.findByRole("alert")).textContent).toBe("Zu viele Versuche, bitte später.");
  });

  it("submit is blocked while the checkbox is unchecked (fetch not called)", async () => {
    const fn = stubFetch(201);
    render(<SignupForm token="tok1" kind="member" />);
    fill({ accept: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(fn).not.toHaveBeenCalled();
    expect((screen.getByRole("checkbox") as HTMLInputElement).required).toBe(true);
  });
});
