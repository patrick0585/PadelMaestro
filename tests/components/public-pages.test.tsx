import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { RequestForm } from "@/app/passwort-vergessen/request-form";
import { ResetForm } from "@/app/passwort-zuruecksetzen/[token]/reset-form";
import { ConfirmButton } from "@/app/email-bestaetigen/[token]/confirm-button";

function stubFetch(status: number, body: unknown = {}) {
  const fn = vi.fn().mockResolvedValue({ status, json: async () => body });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("public pages", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("request form shows the fixed notice after 204", async () => {
    stubFetch(204);
    render(<RequestForm />);
    fireEvent.change(screen.getByLabelText("E-Mail-Adresse"), { target: { value: "a@x.de" } });
    fireEvent.click(screen.getByRole("button", { name: "Link anfordern" }));
    expect((await screen.findByRole("status")).textContent).toBe(
      "Wenn ein Konto mit bestätigter Adresse existiert, haben wir eine Mail geschickt.",
    );
  });

  it("reset form reports mismatch without calling fetch", async () => {
    const fn = stubFetch(204);
    render(<ResetForm token="t1" />);
    fireEvent.change(screen.getByLabelText("Neues Passwort (min. 8 Zeichen)"), { target: { value: "abcdefgh" } });
    fireEvent.change(screen.getByLabelText("Neues Passwort bestätigen"), { target: { value: "abcdefgX" } });
    fireEvent.click(screen.getByRole("button", { name: "Passwort ändern" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Die Passwörter stimmen nicht überein.");
    expect(fn).not.toHaveBeenCalled();
  });

  it("reset form shows invalid-token copy on 400 invalid_token", async () => {
    stubFetch(400, { error: "invalid_token" });
    render(<ResetForm token="t1" />);
    fireEvent.change(screen.getByLabelText("Neues Passwort (min. 8 Zeichen)"), { target: { value: "abcdefgh" } });
    fireEvent.change(screen.getByLabelText("Neues Passwort bestätigen"), { target: { value: "abcdefgh" } });
    fireEvent.click(screen.getByRole("button", { name: "Passwort ändern" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Dieser Link ist ungültig oder abgelaufen.");
  });

  it("confirm button posts the token and shows success on 200", async () => {
    const fn = stubFetch(200, { email: "a@x.de" });
    render(<ConfirmButton token="tok123" />);
    fireEvent.click(screen.getByRole("button", { name: "Adresse bestätigen" }));
    expect((await screen.findByRole("status")).textContent).toBe("Adresse bestätigt");
    expect(screen.getByRole("link", { name: "Zur App" }).getAttribute("href")).toBe("/");
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("/api/email-verification/confirm");
    expect(JSON.parse(init.body)).toEqual({ token: "tok123" });
  });
});
