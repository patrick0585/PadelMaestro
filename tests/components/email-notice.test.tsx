import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EmailNoticeClient } from "@/components/email-notice-client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("<EmailNoticeClient>", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("placeholder: shows hint and link, no resend button", async () => {
    render(<EmailNoticeClient variant="placeholder" pending={null} />);
    expect(
      await screen.findByText("Hinterlege deine E-Mail-Adresse, damit du dein Passwort zurücksetzen kannst."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Zur E-Mail-Adresse" }).getAttribute("href")).toBe("/profil/email");
    expect(screen.queryByRole("button", { name: "Mail erneut senden" })).toBeNull();
  });

  it("unverified: shows text, resend button and pending line", async () => {
    render(<EmailNoticeClient variant="unverified" pending="neu@x.de" />);
    expect(await screen.findByText("Bitte bestätige deine E-Mail-Adresse.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mail erneut senden" })).toBeTruthy();
    expect(screen.getByText("Bestätigung ausstehend für neu@x.de")).toBeTruthy();
  });

  it("resend success shows status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 204 }));
    render(<EmailNoticeClient variant="unverified" pending={null} />);
    fireEvent.click(await screen.findByRole("button", { name: "Mail erneut senden" }));
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe("Mail gesendet.");
  });

  it("resend 503 shows error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 503 }));
    render(<EmailNoticeClient variant="unverified" pending={null} />);
    fireEvent.click(await screen.findByRole("button", { name: "Mail erneut senden" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Mail konnte nicht gesendet werden, bitte später erneut versuchen.");
  });

  it("close sets sessionStorage and removes banner", async () => {
    render(<EmailNoticeClient variant="placeholder" pending={null} />);
    fireEvent.click(await screen.findByRole("button", { name: "Hinweis schließen" }));
    expect(sessionStorage.getItem("email-notice-dismissed")).toBe("1");
    await waitFor(() => expect(screen.queryByText("Zur E-Mail-Adresse")).toBeNull());
  });

  it("stays hidden when already dismissed", async () => {
    sessionStorage.setItem("email-notice-dismissed", "1");
    render(<EmailNoticeClient variant="placeholder" pending={null} />);
    await waitFor(() => expect(screen.queryByText("Zur E-Mail-Adresse")).toBeNull());
  });

  it("showProfileLink=false hides the link; region is labelled", async () => {
    render(<EmailNoticeClient variant="placeholder" pending={null} showProfileLink={false} />);
    expect(await screen.findByRole("region", { name: "Hinweis zur E-Mail-Adresse" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Zur E-Mail-Adresse" })).toBeNull();
  });

  it("resend 401 redirects to /login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401 }));
    const loc = { href: "" };
    vi.stubGlobal("location", loc);
    render(<EmailNoticeClient variant="unverified" pending={null} />);
    fireEvent.click(await screen.findByRole("button", { name: "Mail erneut senden" }));
    await waitFor(() => expect(loc.href).toBe("/login"));
  });

  it("compact: eine Zeile mit Link, die dauerhaft weggetippt bleibt", async () => {
    const { unmount } = render(<EmailNoticeClient variant="placeholder" pending={null} compact />);
    const link = await screen.findByRole("link", { name: /E-Mail ergänzen/ });
    expect(link).toHaveAttribute("href", "/profil/email");
    fireEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));
    expect(localStorage.getItem("email-notice-home-dismissed")).toBe("1");
    expect(sessionStorage.getItem("email-notice-dismissed")).toBeNull();
    unmount();
    render(<EmailNoticeClient variant="placeholder" pending={null} compact />);
    await waitFor(() => expect(screen.queryByRole("link", { name: /E-Mail ergänzen/ })).toBeNull());
  });

  it("compact unbestätigt: Hinweis zum Bestätigen", async () => {
    render(<EmailNoticeClient variant="unverified" pending={null} compact />);
    expect(await screen.findByRole("link", { name: /E-Mail bestätigen/ })).toHaveAttribute("href", "/profil/email");
  });
});
