import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { EmailForm } from "@/app/profil/email-form";

function submit(status: number) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status, json: async () => ({}) }));
  render(<EmailForm email="a@x.de" pendingEmail={null} emailVerified={true} />);
  fireEvent.change(screen.getByLabelText("Neue E-Mail-Adresse"), { target: { value: "b@x.de" } });
  fireEvent.click(screen.getByRole("button", { name: "Ändern" }));
}

describe("<EmailForm>", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("409 shows taken message", async () => {
    submit(409);
    expect((await screen.findByRole("alert")).textContent).toBe("Diese Adresse ist schon vergeben.");
  });

  it("503 shows mail failure", async () => {
    submit(503);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Mail konnte nicht gesendet werden, bitte später erneut versuchen.",
    );
  });

  it("429 and 400 messages", async () => {
    submit(429);
    expect((await screen.findByRole("alert")).textContent).toBe("Zu viele Versuche, bitte später.");
  });

  it("204 shows success with address", async () => {
    submit(204);
    expect((await screen.findByRole("status")).textContent).toBe(
      "Wir haben dir eine Mail an b@x.de geschickt.",
    );
  });

  it("verified: badge Bestätigt, no resend; unverified: Unbestätigt, resend and pending", () => {
    const { unmount } = render(<EmailForm email="a@x.de" pendingEmail={null} emailVerified={true} />);
    expect(screen.getByText("Bestätigt")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mail erneut senden" })).toBeNull();
    unmount();
    render(<EmailForm email="a@x.de" pendingEmail="n@x.de" emailVerified={false} />);
    expect(screen.getByText("Unbestätigt")).toBeTruthy();
    expect(screen.getByText("Bestätigung ausstehend für n@x.de")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mail erneut senden" })).toBeTruthy();
  });
});
