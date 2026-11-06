import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect, vi } from "vitest";
import ErrorPage from "@/app/error";

describe("Fehlerseite", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("lädt bei einem Versionswechsel einmal von selbst neu", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    render(<ErrorPage error={Object.assign(new Error("Loading chunk 9 failed."), { name: "ChunkLoadError" })} reset={vi.fn()} />);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/neue Version/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("zeigt bei anderen Fehlern eine deutsche Meldung mit Neu laden und Erneut versuchen", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    render(<ErrorPage error={new Error("boom")} reset={reset} />);
    expect(screen.getByRole("heading", { name: "Da ist etwas schiefgelaufen" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(reset).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Zur Startseite" })).toHaveAttribute("href", "/");
  });
});
