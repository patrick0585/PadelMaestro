import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { ShareResultButton } from "@/app/game-day/share-result-button";

// jsdom's own Blob, so FileReader and File accept it (a fetch Response would hand back Node's Blob).
const png = () => ({ ok: true, status: 200, blob: async () => new Blob(["png"], { type: "image/png" }) });

describe("<ShareResultButton>", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => png())));
  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.Capacitor;
    // @ts-expect-error test cleanup
    delete navigator.share;
    // @ts-expect-error test cleanup
    delete navigator.canShare;
  });

  it("teilt in der App über die nativen Plugins", async () => {
    const writeFile = vi.fn(async () => ({ uri: "file:///cache/spieltag.png" }));
    const deleteFile = vi.fn(async () => {});
    const share = vi.fn(async () => ({}));
    window.Capacitor = { isNativePlatform: () => true, Plugins: { Filesystem: { writeFile, deleteFile }, Share: { share } } };
    render(<ShareResultButton gameDayId="d1" fileName="spieltag-2026-11-12.png" />);
    await userEvent.click(screen.getByRole("button", { name: "Ergebnis teilen" }));
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: ["file:///cache/spieltag.png"] })));
    expect(fetch).toHaveBeenCalledWith("/api/game-days/d1/share-image", expect.objectContaining({ signal: expect.anything() }));
    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: "spieltag-2026-11-12.png", directory: "CACHE" }));
    await waitFor(() => expect(deleteFile).toHaveBeenCalledWith({ path: "spieltag-2026-11-12.png", directory: "CACHE" }));
  });

  it("nutzt im Browser das Teilen des Browsers", async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    Object.assign(navigator, { share, canShare: () => true });
    render(<ShareResultButton gameDayId="d1" fileName="x.png" />);
    await userEvent.click(screen.getByRole("button", { name: "Ergebnis teilen" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    const arg = share.mock.calls[0][0] as { files: File[] };
    expect(arg.files[0].name).toBe("x.png");
  });

  it("Abbrechen im Teilen-Menü ist kein Fehler", async () => {
    Object.assign(navigator, { share: vi.fn(async () => { throw new DOMException("x", "AbortError"); }), canShare: () => true });
    render(<ShareResultButton gameDayId="d1" fileName="x.png" />);
    await userEvent.click(screen.getByRole("button", { name: "Ergebnis teilen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Ergebnis teilen" })).toBeEnabled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ein echter Fehler beim Teilen wird gemeldet, auch wenn 'cancel' im Text steht", async () => {
    Object.assign(navigator, { share: vi.fn(async () => { throw new Error("upload cancelled by network"); }), canShare: () => true });
    render(<ShareResultButton gameDayId="d1" fileName="x.png" />);
    await userEvent.click(screen.getByRole("button", { name: "Ergebnis teilen" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("meldet, wenn das Bild nicht geladen werden kann", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    render(<ShareResultButton gameDayId="d1" fileName="x.png" />);
    await userEvent.click(screen.getByRole("button", { name: "Ergebnis teilen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bild konnte nicht erstellt werden");
  });
});
