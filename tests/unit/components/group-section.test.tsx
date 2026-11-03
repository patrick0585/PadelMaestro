import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GroupSection } from "@/app/admin/group-section";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe("GroupSection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the groupId with the rename and shows the stale-group text on 409", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 409,
      json: async () => ({ error: "stale_group" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GroupSection groupId="g-1" name="Padelfreunde" slug="padelfreunde" />);
    fireEvent.change(screen.getByLabelText("Gruppenname"), { target: { value: "Neu" } });
    fireEvent.click(screen.getByRole("button", { name: "Umbenennen" }));
    expect(
      await screen.findByText("Die aktive Gruppe hat sich geändert. Bitte die Seite neu laden."),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ groupId: "g-1", name: "Neu" });
  });

  it("shows the slug under the name field", () => {
    render(<GroupSection groupId="g-1" name="Padelfreunde" slug="padelfreunde-1a2b3c" />);
    expect(screen.getByText("Slug: padelfreunde-1a2b3c")).toHaveClass(
      "text-xs",
      "text-foreground-muted",
    );
  });
});
