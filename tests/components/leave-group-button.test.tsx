import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LeaveGroupButton } from "@/app/profil/leave-group-button";

const assign = vi.fn();

function stubFetch(status: number, body: unknown = {}) {
  const fn = vi.fn().mockResolvedValue({ status, json: async () => body });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("<LeaveGroupButton>", () => {
  beforeEach(() => {
    assign.mockReset();
    vi.stubGlobal("location", { ...window.location, assign });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("button confirms, posts, navigates to / on 204, and shows the three 409 texts", async () => {
    const fn = stubFetch(204);
    render(<LeaveGroupButton />);
    fireEvent.click(screen.getByRole("button", { name: "Gruppe verlassen" }));
    expect(screen.getByText("Wirklich verlassen?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByText("Wirklich verlassen?")).toBeNull();
    expect(fn).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Gruppe verlassen" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, verlassen" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    expect(fn.mock.calls[0][0]).toBe("/api/profile/leave-group");
    expect(fn.mock.calls[0][1].method).toBe("POST");
  });

  it.each([
    ["owner_protected", "Als Besitzer kannst du die Gruppe nicht verlassen."],
    ["last_admin", "Du bist der letzte Admin. Ernenne zuerst einen anderen."],
    ["active_participation", "Du bist für einen Spieltag eingeplant. Sag erst ab."],
  ])("shows the %s text on 409", async (code, text) => {
    stubFetch(409, { error: code });
    render(<LeaveGroupButton />);
    fireEvent.click(screen.getByRole("button", { name: "Gruppe verlassen" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, verlassen" }));
    expect((await screen.findByRole("alert")).textContent).toBe(text);
    expect(assign).not.toHaveBeenCalled();
  });
});
