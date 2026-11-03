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
    render(<LeaveGroupButton groupName="Die Smasher" />);
    fireEvent.click(screen.getByRole("button", { name: "Gruppe verlassen" }));
    const prompt = "Gruppe „Die Smasher“ wirklich verlassen? Du kommst nur mit neuer Einladung zurück.";
    expect(screen.getByText(prompt)).toBeTruthy();
    expect(screen.getByRole("group", { name: prompt })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Abbrechen" }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByText(prompt)).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Gruppe verlassen" }));
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
    render(<LeaveGroupButton groupName="Die Smasher" />);
    fireEvent.click(screen.getByRole("button", { name: "Gruppe verlassen" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, verlassen" }));
    expect((await screen.findByRole("alert")).textContent).toBe(text);
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows the generic failure text on 500 and on a fetch error, and returns focus to the trigger", async () => {
    stubFetch(500);
    const { unmount } = render(<LeaveGroupButton groupName="Die Smasher" />);
    fireEvent.click(screen.getByRole("button", { name: "Gruppe verlassen" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, verlassen" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Verlassen fehlgeschlagen.");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Gruppe verlassen" }));
    unmount();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<LeaveGroupButton groupName="Die Smasher" />);
    fireEvent.click(screen.getByRole("button", { name: "Gruppe verlassen" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, verlassen" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Verlassen fehlgeschlagen.");
    expect(assign).not.toHaveBeenCalled();
  });
});
