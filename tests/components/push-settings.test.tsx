import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const isNativeApp = vi.fn();
vi.mock("@/lib/platform", () => ({ isNativeApp: () => isNativeApp() }));
import { PushSettings } from "@/app/profil/push-settings";

const FOOTNOTE =
  "Erinnerung am Vortag um 18 Uhr und am Spieltag um 14 Uhr (bei frühem Anpfiff 3 Stunden vorher), wenn du noch nicht abgestimmt hast.";

describe("<PushSettings>", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    isNativeApp.mockReturnValue(true);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders nothing outside the app", () => {
    isNativeApp.mockReturnValue(false);
    const { container } = render(<PushSettings remindersEnabled />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows section, row, switch and footnote in the app", async () => {
    render(<PushSettings remindersEnabled />);
    expect(await screen.findByRole("heading", { name: "Benachrichtigungen" })).toBeInTheDocument();
    const sw = screen.getByRole("switch", { name: "Erinnerungen" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(FOOTNOTE)).toBeInTheDocument();
  });

  it("sends the new value on click", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    render(<PushSettings remindersEnabled />);
    const sw = await screen.findByRole("switch", { name: "Erinnerungen" });
    fireEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(sw).toBeDisabled();
    await waitFor(() => expect(sw).not.toBeDisabled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile/push",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ remindersEnabled: false }),
      }),
    );
    expect(sw).toHaveAttribute("aria-checked", "false");
  });

  it("reverts and shows a hint on an error response", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    render(<PushSettings remindersEnabled />);
    const sw = await screen.findByRole("switch", { name: "Erinnerungen" });
    fireEvent.click(sw);
    expect(await screen.findByText("Konnte nicht gespeichert werden.")).toBeInTheDocument();
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(sw).not.toBeDisabled();
  });

  it("reverts on a network error", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<PushSettings remindersEnabled={false} />);
    const sw = await screen.findByRole("switch", { name: "Erinnerungen" });
    fireEvent.click(sw);
    expect(await screen.findByText("Konnte nicht gespeichert werden.")).toBeInTheDocument();
    expect(sw).toHaveAttribute("aria-checked", "false");
  });
});
