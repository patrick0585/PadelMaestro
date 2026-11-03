import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TransferOwnerDialog } from "@/app/admin/transfer-owner-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const player = { id: "p-1", name: "Martin" };

describe("TransferOwnerDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    refresh.mockReset();
  });

  it("dialog confirms and posts the playerId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();

    render(<TransferOwnerDialog open onClose={onClose} player={player} />);
    expect(screen.getByRole("heading", { name: "Besitz übertragen" })).toBeInTheDocument();
    expect(screen.getByText("Martin wird Besitzer der Gruppe. Du wirst Admin.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Besitz übertragen" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/groups/active/transfer-owner");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ playerId: "p-1" });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the self-transfer message on 409", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "self_transfer" }) }),
    );
    const onClose = vi.fn();
    render(<TransferOwnerDialog open onClose={onClose} player={player} />);
    fireEvent.click(screen.getByRole("button", { name: "Besitz übertragen" }));
    expect(
      await screen.findByText("Du kannst den Besitz nicht an dich selbst übertragen."),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
