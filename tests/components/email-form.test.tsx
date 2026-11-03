import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { EmailForm } from "@/app/profil/email-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

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

  it("429 shows rate limit", async () => {
    submit(429);
    expect((await screen.findByRole("alert")).textContent).toBe("Zu viele Versuche, bitte später.");
  });

  it("400 shows invalid address", async () => {
    submit(400);
    expect((await screen.findByRole("alert")).textContent).toBe("Bitte eine gültige E-Mail-Adresse eingeben.");
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

  it("no resend for an unverified placeholder address, but resend once a real address is pending", () => {
    const { unmount } = render(
      <EmailForm email="maxi@padel.local" pendingEmail={null} emailVerified={false} />,
    );
    expect(screen.queryByRole("button", { name: "Mail erneut senden" })).toBeNull();
    unmount();
    render(<EmailForm email="maxi@padel.local" pendingEmail="maxi@x.de" emailVerified={false} />);
    expect(screen.getByRole("button", { name: "Mail erneut senden" })).toBeTruthy();
  });
});
