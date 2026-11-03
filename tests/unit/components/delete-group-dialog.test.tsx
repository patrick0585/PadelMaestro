import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DeleteGroupDialog } from "@/app/admin/delete-group-dialog";

describe("DeleteGroupDialog", () => {
  const assign = vi.fn();
  const originalLocation = window.location;

  beforeEach(() => {
    assign.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    vi.unstubAllGlobals();
  });

  it("dialog enables the delete button only when the name matches and posts name and password", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(<DeleteGroupDialog open onClose={vi.fn()} name="Padelfreunde" />);
    expect(screen.getByRole("heading", { name: "Gruppe löschen" })).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === "P" &&
          el.textContent ===
            "Das löscht alle Spieltage, Ergebnisse und Einladungen von Padelfreunde. Die Konten der Mitglieder bleiben.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Padelfreunde", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abbrechen" })).toHaveFocus();

    const confirm = screen.getByRole("button", { name: "Endgültig löschen" });
    const nameInput = screen.getByLabelText("Gruppenname zur Bestätigung");
    const pwInput = screen.getByLabelText("Dein Passwort");
    expect(pwInput).toHaveAttribute("type", "password");
    expect(pwInput).toHaveAttribute("autocomplete", "current-password");
    expect(confirm).toBeDisabled();

    fireEvent.change(nameInput, { target: { value: "padelfreunde" } });
    fireEvent.change(pwInput, { target: { value: "geheim" } });
    expect(confirm).toBeDisabled();

    fireEvent.change(nameInput, { target: { value: "Padelfreunde" } });
    fireEvent.change(pwInput, { target: { value: "" } });
    expect(confirm).toBeDisabled();

    fireEvent.change(pwInput, { target: { value: "geheim" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/groups/active");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body)).toEqual({ name: "Padelfreunde", password: "geheim" });
  });

  it.each([
    [400, "name_mismatch", "Der Name stimmt nicht."],
    [403, "wrong_password", "Passwort falsch."],
    [403, "forbidden", "Nur der Besitzer kann die Gruppe löschen."],
    [429, "rate_limited", "Zu viele Versuche, bitte später."],
    [500, "boom", "Löschen fehlgeschlagen."],
  ])("shows the message for %i %s", async (status, error, text) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ error }) }),
    );
    render(<DeleteGroupDialog open onClose={vi.fn()} name="Padelfreunde" />);
    fireEvent.change(screen.getByLabelText("Gruppenname zur Bestätigung"), {
      target: { value: "Padelfreunde" },
    });
    fireEvent.change(screen.getByLabelText("Dein Passwort"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Endgültig löschen" }));
    expect(await screen.findByText(text)).toHaveAttribute("role", "alert");
    expect(assign).not.toHaveBeenCalled();
  });
});
