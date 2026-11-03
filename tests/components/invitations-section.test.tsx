import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  InvitationsSection,
  type SerializedOpenInvitation,
} from "@/app/admin/invitations-section";

function response(status: number, body?: unknown) {
  return Promise.resolve({ ok: status < 300, status, json: async () => body });
}

function stubFetchSequence(...replies: { status: number; body?: unknown }[]) {
  const fn = vi.fn();
  for (const r of replies) fn.mockImplementationOnce(() => response(r.status, r.body));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const invitation: SerializedOpenInvitation = {
  id: "inv1",
  note: "Dienstagsrunde",
  expiresAt: "2026-11-17T10:00:00.000Z",
  usedCount: 2,
  maxUses: 25,
  createdAt: "2026-11-03T10:00:00.000Z",
  uses: [
    { playerId: "p1", playerName: "Anna", usedAt: "2026-11-04T10:00:00.000Z" },
    { playerId: "p2", playerName: "Ben", usedAt: "2026-11-05T10:00:00.000Z" },
  ],
};

describe("<InvitationsSection>", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders the empty state and creates a link, then shows the url with a copy button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const url = "https://padelmaestro.de/einladung/tok123";
    const fn = stubFetchSequence(
      { status: 201, body: { id: "inv1", url, expiresAt: invitation.expiresAt } },
      { status: 200, body: [{ ...invitation, usedCount: 0, uses: [] }] },
    );

    render(<InvitationsSection initial={[]} />);
    expect(screen.getByText("Noch keine offenen Links.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Notiz (optional)"), {
      target: { value: "Dienstagsrunde" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Einladungslink erstellen" }));

    const linkInput = await screen.findByLabelText("Einladungslink");
    expect(linkInput).toHaveValue(url);
    expect(screen.getByText("Der Link ist nur jetzt kopierbar.")).toBeInTheDocument();
    const [postUrl, init] = fn.mock.calls[0];
    expect(postUrl).toBe("/api/invitations");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ note: "Dienstagsrunde" });

    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    expect(fn.mock.calls[1][0]).toBe("/api/invitations");
    expect(await screen.findByText("Dienstagsrunde")).toBeInTheDocument();
    expect(screen.queryByText("Noch keine offenen Links.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Kopieren" }));
    expect(writeText).toHaveBeenCalledWith(url);
    expect(await screen.findByRole("button", { name: "Kopiert" })).toBeInTheDocument();
  });

  it("revoke removes the row after a 204", async () => {
    const fn = stubFetchSequence({ status: 204 }, { status: 200, body: [] });
    render(<InvitationsSection initial={[invitation]} />);
    expect(screen.getByText("Dienstagsrunde")).toBeInTheDocument();
    expect(screen.getByText(/2 von 25 verwendet/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Widerrufen" }));

    expect(await screen.findByText("Noch keine offenen Links.")).toBeInTheDocument();
    expect(screen.queryByText("Dienstagsrunde")).not.toBeInTheDocument();
    expect(fn.mock.calls[0][0]).toBe("/api/invitations/inv1");
    expect(fn.mock.calls[0][1].method).toBe("DELETE");
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
  });

  it("expands the joined names of a link", () => {
    render(<InvitationsSection initial={[invitation]} />);
    const summary = screen.getByText("Beigetreten (2)");
    expect(summary.tagName).toBe("SUMMARY");
    const details = summary.closest("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    expect(details).toHaveTextContent("Anna · 04.11.2026");
    expect(details).toHaveTextContent("Ben · 05.11.2026");
  });
});
