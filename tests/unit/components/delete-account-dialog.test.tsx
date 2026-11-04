import { describe, it, expect, vi, afterEach, beforeEach, onTestFinished } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
import { signOut } from "next-auth/react";
vi.mock("@/lib/push/client", () => ({ unregisterThisDevice: vi.fn() }));
import { unregisterThisDevice } from "@/lib/push/client";
import { DeleteAccountDialog } from "@/app/profil/delete-account-dialog";

const signOutMock = signOut as unknown as ReturnType<typeof vi.fn>;
const unregisterMock = unregisterThisDevice as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  signOutMock.mockReset();
  unregisterMock.mockReset();
  unregisterMock.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

function submit(password = "geheim") {
  fireEvent.change(screen.getByLabelText("Dein Passwort"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Endgültig löschen" }));
}

describe("DeleteAccountDialog", () => {
  it("gates the confirm button on the password, sends DELETE with the password, calls signOut on 204, shows the 403 and 409 texts with group names", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 204, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(<DeleteAccountDialog open onClose={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Konto löschen" })).toBeInTheDocument();
    expect(screen.getByText("Das kann nicht rückgängig gemacht werden.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Du wirst aus allen Gruppen entfernt und abgemeldet. Deine Spielergebnisse bleiben ohne deinen Namen erhalten. Dein Profil und dein Login werden gelöscht. Exportiere vorher deine Daten, wenn du sie behalten willst.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abbrechen" })).toHaveFocus();
    const pw = screen.getByLabelText("Dein Passwort");
    expect(pw).toHaveAttribute("type", "password");
    expect(pw).toHaveAttribute("autocomplete", "current-password");
    const confirm = screen.getByRole("button", { name: "Endgültig löschen" });
    expect(confirm).toBeDisabled();
    fireEvent.change(pw, { target: { value: "geheim" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/login" }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/profile");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body)).toEqual({ password: "geheim" });
  });

  it("shows the 403 text with aria-invalid and the 409 text with joined group names", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 403, json: async () => ({ error: "wrong_password" }) }),
    );
    const { unmount } = render(<DeleteAccountDialog open onClose={vi.fn()} />);
    submit();
    expect(await screen.findByText("Passwort falsch.")).toHaveAttribute("role", "alert");
    expect(screen.getByLabelText("Dein Passwort")).toHaveAttribute("aria-invalid", "true");
    expect(signOutMock).not.toHaveBeenCalled();
    const alertId = screen.getByText("Passwort falsch.").id;
    expect(alertId).not.toBe("");
    expect(screen.getByLabelText("Dein Passwort")).toHaveAttribute("aria-describedby", alertId);
    unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 409,
        json: async () => ({
          error: "owner_of_group",
          groups: [
            { id: "1", name: "Padelfreunde" },
            { id: "2", name: "Dienstags" },
          ],
        }),
      }),
    );
    render(<DeleteAccountDialog open onClose={vi.fn()} />);
    submit();
    expect(
      await screen.findByText(
        "Du bist Besitzer von „Padelfreunde“, „Dienstags“. Übertrage den Besitz oder lösche die Gruppe zuerst.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the operator hint on 409 anonymisation_collision", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ status: 409, json: async () => ({ error: "anonymisation_collision" }) }),
    );
    render(<DeleteAccountDialog open onClose={vi.fn()} />);
    submit();
    expect(
      await screen.findByText("Löschen gerade nicht möglich. Bitte den Betreiber kontaktieren."),
    ).toBeInTheDocument();
  });

  it.each([
    [429, "Zu viele Versuche. Bitte versuche es später erneut."],
    [500, "Löschen fehlgeschlagen."],
  ])("shows the text for %i", async (status, text) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status, json: async () => ({}) }));
    render(<DeleteAccountDialog open onClose={vi.fn()} />);
    submit();
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("falls back to /login when signOut throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 204, json: async () => ({}) }));
    signOutMock.mockRejectedValue(new Error("boom"));
    const assign = vi.fn();
    const orig = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { assign } });
    onTestFinished(() => {
      Object.defineProperty(window, "location", { configurable: true, value: orig });
    });
    render(<DeleteAccountDialog open onClose={vi.fn()} />);
    submit();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/login"));
  });

  it("cannot be closed by Escape while the request is in flight", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const onClose = vi.fn();
    render(<DeleteAccountDialog open onClose={onClose} />);
    submit();
    await waitFor(() => expect(screen.getByRole("button", { name: "Abbrechen" })).toBeDisabled());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("meldet das Gerät nach erfolgreichem Löschen vor signOut ab", async () => {
    const order: string[] = [];
    unregisterMock.mockImplementation(async () => void order.push("unregister"));
    signOutMock.mockImplementation(async () => void order.push("signOut"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 204, json: async () => ({}) }));
    render(<DeleteAccountDialog open onClose={vi.fn()} />);
    submit();
    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    expect(order).toEqual(["unregister", "signOut"]);
  });

  it("meldet das Gerät bei falschem Passwort nicht ab", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 403, json: async () => ({ error: "wrong_password" }) }),
    );
    render(<DeleteAccountDialog open onClose={vi.fn()} />);
    submit();
    await screen.findByText("Passwort falsch.");
    expect(unregisterMock).not.toHaveBeenCalled();
  });
});
