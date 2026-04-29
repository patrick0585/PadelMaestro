import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InstallHint } from "@/components/install-hint";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    get: () => ua,
  });
}

function setStandalone(value: boolean) {
  Object.defineProperty(window.navigator, "standalone", {
    configurable: true,
    get: () => value,
  });
}

function setMatchMediaStandalone(matches: boolean) {
  // jsdom's matchMedia always returns matches:false; replace it so we
  // can exercise the Chromium "(display-mode: standalone)" branch.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("standalone") ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function makeBeforeInstallPromptEvent(
  outcome: "accepted" | "dismissed" | "reject" = "accepted",
) {
  const prompt = vi.fn(() =>
    outcome === "reject" ? Promise.reject(new Error("stale")) : Promise.resolve(),
  );
  const userChoice =
    outcome === "reject"
      ? Promise.resolve({ outcome: "dismissed" as const })
      : Promise.resolve({ outcome: outcome as "accepted" | "dismissed" });
  const event = Object.assign(new Event("beforeinstallprompt"), {
    prompt,
    userChoice,
  });
  return { event, prompt };
}

describe("InstallHint", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setStandalone(false);
    setMatchMediaStandalone(false);
    // Default: a desktop UA that has neither iOS markers nor a fired
    // beforeinstallprompt event — the banner should stay hidden.
    setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing on a non-iOS browser without an install prompt event", () => {
    const { container } = render(<InstallHint />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the iOS Add-to-Home-Screen instructions on iPhone Safari", () => {
    setUserAgent(IPHONE_SAFARI);
    render(<InstallHint />);
    expect(screen.getByText(/Zum Home-Bildschirm/)).toBeInTheDocument();
  });

  it("stays hidden on Chrome iOS (CriOS) — Chrome iOS cannot install PWAs", () => {
    setUserAgent(IPHONE_CHROME);
    const { container } = render(<InstallHint />);
    expect(container).toBeEmptyDOMElement();
  });

  it("stays hidden when navigator.standalone is true (already installed)", () => {
    setUserAgent(IPHONE_SAFARI);
    setStandalone(true);
    const { container } = render(<InstallHint />);
    expect(container).toBeEmptyDOMElement();
  });

  it("stays hidden after the user has dismissed it", () => {
    setUserAgent(IPHONE_SAFARI);
    window.localStorage.setItem("padel.installHintDismissed", "1");
    const { container } = render(<InstallHint />);
    expect(container).toBeEmptyDOMElement();
  });

  it("stays hidden when display-mode:standalone matches (Chromium PWA already installed)", () => {
    setMatchMediaStandalone(true);
    const { container } = render(<InstallHint />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hides and persists the dismiss when the user clicks the close button on the iOS hint", () => {
    setUserAgent(IPHONE_SAFARI);
    render(<InstallHint />);
    fireEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));
    expect(screen.queryByText(/Zum Home-Bildschirm/)).toBeNull();
    expect(window.localStorage.getItem("padel.installHintDismissed")).toBe("1");
  });

  it("shows an install button after a Chrome beforeinstallprompt event and clears the single-use event after the user accepts", async () => {
    render(<InstallHint />);
    expect(screen.queryByRole("button", { name: "Installieren" })).toBeNull();

    const { event, prompt } = makeBeforeInstallPromptEvent("accepted");
    act(() => {
      window.dispatchEvent(event);
    });

    fireEvent.click(await screen.findByRole("button", { name: "Installieren" }));

    await waitFor(() => {
      expect(prompt).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Installieren" })).toBeNull();
    });
    expect(window.localStorage.getItem("padel.installHintDismissed")).toBe("1");
  });

  it("dismisses and persists when the native prompt resolves with outcome=dismissed", async () => {
    render(<InstallHint />);
    const { event, prompt } = makeBeforeInstallPromptEvent("dismissed");
    act(() => {
      window.dispatchEvent(event);
    });

    fireEvent.click(await screen.findByRole("button", { name: "Installieren" }));

    await waitFor(() => {
      expect(prompt).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Installieren" })).toBeNull();
    });
    expect(window.localStorage.getItem("padel.installHintDismissed")).toBe("1");
  });

  it("swallows a rejected prompt() (stale event) and still dismisses", async () => {
    render(<InstallHint />);
    const { event, prompt } = makeBeforeInstallPromptEvent("reject");
    act(() => {
      window.dispatchEvent(event);
    });

    fireEvent.click(await screen.findByRole("button", { name: "Installieren" }));

    await waitFor(() => {
      expect(prompt).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Installieren" })).toBeNull();
    });
    expect(window.localStorage.getItem("padel.installHintDismissed")).toBe("1");
  });

  it("dismiss-X on the Android banner hides it without firing prompt()", async () => {
    render(<InstallHint />);
    const { event, prompt } = makeBeforeInstallPromptEvent("accepted");
    act(() => {
      window.dispatchEvent(event);
    });

    await screen.findByRole("button", { name: "Installieren" });
    fireEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));

    expect(prompt).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Installieren" })).toBeNull();
    expect(window.localStorage.getItem("padel.installHintDismissed")).toBe("1");
  });

  it("clears the banner and persists the dismiss when the browser fires appinstalled", async () => {
    render(<InstallHint />);
    const { event } = makeBeforeInstallPromptEvent("accepted");
    act(() => {
      window.dispatchEvent(event);
    });
    await screen.findByRole("button", { name: "Installieren" });

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Installieren" })).toBeNull();
    });
    expect(window.localStorage.getItem("padel.installHintDismissed")).toBe("1");
  });
});
