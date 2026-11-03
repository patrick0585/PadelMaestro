import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EditPlayerDialog, type EditablePlayer } from "@/app/admin/edit-player-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

function player(role: EditablePlayer["role"]): EditablePlayer {
  return {
    id: "p",
    name: "Olga",
    email: "o@example.com",
    username: null,
    isAdmin: role !== "member",
    role,
  };
}

describe("EditPlayerDialog Rolle", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("dialog shows a role select for members and the owner badge for the owner, and sends role on change", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(
      <EditPlayerDialog open onClose={() => {}} player={player("member")} />,
    );
    const select = screen.getByLabelText("Rolle") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.value).toBe("member");
    expect(screen.getByRole("option", { name: "Mitglied" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Admin" })).toBeInTheDocument();
    expect(screen.queryByText("Besitzer")).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: "admin" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ role: "admin" });
    unmount();

    render(<EditPlayerDialog open onClose={() => {}} player={player("owner")} />);
    expect(screen.getByText("Besitzer")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Anzeigename"), { target: { value: "Olga B" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ name: "Olga B" });
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
    render(<EditPlayerDialog open onClose={() => {}} player={player("member")} />);
    fireEvent.change(screen.getByLabelText("E-Mail"), { target: { value: "neu@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(
      await screen.findByText(
        "Dieses Konto ist auch in anderen Gruppen. Änderungen am Konto macht die Person selbst im Profil.",
      ),
    ).toBeInTheDocument();
  });
});
