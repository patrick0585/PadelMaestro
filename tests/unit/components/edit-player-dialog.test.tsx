import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EditPlayerDialog, type EditablePlayer } from "@/app/admin/edit-player-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

function player(): EditablePlayer {
  return { id: "p", name: "Olga", email: "o@example.com", username: null };
}

describe("EditPlayerDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("has no role field and sends only changed fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(<EditPlayerDialog open onClose={() => {}} player={player()} />);
    expect(screen.queryByLabelText("Rolle")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Anzeigename"), { target: { value: "Olga B" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: "Olga B" });
  });

  it("shows the shared-account text on 409 account_shared", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "account_shared" }),
      }),
    );
    render(<EditPlayerDialog open onClose={() => {}} player={player()} />);
    fireEvent.change(screen.getByLabelText("E-Mail"), { target: { value: "neu@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(
      await screen.findByText(
        "Dieses Konto ist auch in anderen Gruppen. Änderungen am Konto macht die Person selbst im Profil.",
      ),
    ).toBeInTheDocument();
  });
});
