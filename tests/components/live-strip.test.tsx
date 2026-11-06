import { render, screen } from "@testing-library/react";
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";

let path = "/";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
import { LiveStrip } from "@/components/live-strip";

afterEach(() => vi.unstubAllGlobals());

describe("<LiveStrip>", () => {
  it("führt mit dem laufenden Match zum Spieltag", () => {
    path = "/ranking";
    render(<LiveStrip live={{ current: 6, total: 15 }} />);
    const link = screen.getByRole("link", { name: /Spieltag läuft/ });
    expect(link).toHaveAttribute("href", "/game-day");
    expect(link).toHaveTextContent("Match 6 von 15");
    expect(link).toHaveTextContent("Zum Court");
  });

  it("meldet, wenn alle Matches gewertet sind", () => {
    path = "/";
    render(<LiveStrip live={{ current: null, total: 15 }} />);
    expect(screen.getByRole("link", { name: /Spieltag läuft/ })).toHaveTextContent("Alle 15 Matches gewertet");
  });

  it("entfällt auf der Spieltag-Seite selbst", () => {
    path = "/game-day";
    const { container } = render(<LiveStrip live={{ current: 2, total: 15 }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("holt den Stand neu: Spieltag startet, während man auf einer anderen Seite ist", async () => {
    path = "/ranking";
    const fetchMock = vi.fn(async () => Response.json({ live: { current: 1, total: 15 } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveStrip live={null} />);
    await waitFor(() => expect(screen.getByRole("link", { name: /Spieltag läuft/ })).toHaveTextContent("Match 1 von 15"));
    expect(fetchMock).toHaveBeenCalledWith("/api/game-day/live", expect.anything());
  });

  it("verschwindet, sobald der Spieltag beendet ist", async () => {
    path = "/";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ live: null })));
    render(<LiveStrip live={{ current: 15, total: 15 }} />);
    await waitFor(() => expect(screen.queryByRole("link", { name: /Spieltag läuft/ })).toBeNull());
  });

  it("behält den letzten Stand, wenn die Abfrage scheitert", async () => {
    path = "/";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(<LiveStrip live={{ current: 3, total: 15 }} />);
    await act(async () => {});
    expect(screen.getByRole("link", { name: /Spieltag läuft/ })).toHaveTextContent("Match 3 von 15");
  });
});
