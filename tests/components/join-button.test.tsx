import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JoinButton } from "@/app/einladung/[token]/join-button";

const assign = vi.fn();

function stubFetch(status: number, body: unknown = {}) {
  const fn = vi.fn().mockResolvedValue({ status, json: async () => body });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("<JoinButton>", () => {
  beforeEach(() => {
    assign.mockReset();
    vi.stubGlobal("location", { ...window.location, assign });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("posts the token and navigates to / for member, /gruppe/neu for founder", async () => {
    const fn = stubFetch(200, { kind: "member", groupId: "g1", outcome: "joined" });
    const { unmount } = render(<JoinButton token="tok1" kind="member" groupName="Die Smasher" />);
    expect(screen.getByText("Du bist angemeldet und trittst Die Smasher bei.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gruppe Die Smasher beitreten" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("/api/invitations/join");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ token: "tok1" });
    unmount();

    assign.mockReset();
    stubFetch(200, { kind: "founder", outcome: "granted" });
    render(<JoinButton token="tok2" kind="founder" groupName={null} />);
    expect(screen.getByText("Du bist angemeldet. Mit diesem Link gründest du eine eigene Gruppe.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gruppe gründen" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/gruppe/neu"));
  });

  it("shows invalid-link copy on 410", async () => {
    stubFetch(410, { error: "invitation_invalid" });
    render(<JoinButton token="tok1" kind="member" groupName="Die Smasher" />);
    fireEvent.click(screen.getByRole("button", { name: "Gruppe Die Smasher beitreten" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Dieser Link ist nicht mehr gültig.");
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows the rate-limit copy on 429", async () => {
    stubFetch(429);
    render(<JoinButton token="tok1" kind="member" groupName="Die Smasher" />);
    fireEvent.click(screen.getByRole("button", { name: "Gruppe Die Smasher beitreten" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Zu viele Versuche, bitte später.");
  });

  it("falls back to a neutral group label when the name is missing", () => {
    render(<JoinButton token="tok1" kind="member" groupName={null} />);
    expect(screen.getByRole("button", { name: "Gruppe einer Gruppe beitreten" })).toBeTruthy();
    expect(screen.getByText("Du bist angemeldet und trittst einer Gruppe bei.")).toBeTruthy();
  });
});
