import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { PlayersList } from "@/app/admin/spieler/players-list";
import type { MemberRow } from "@/lib/group/members";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

function row(o: Partial<MemberRow> & Pick<MemberRow, "id" | "name" | "role">): MemberRow {
  return {
    email: `${o.id}@x.de`,
    username: null,
    hasPassword: true,
    emailVerified: true,
    avatarVersion: 0,
    ...o,
  };
}

const players: MemberRow[] = [
  row({ id: "o", name: "Patrick", role: "owner" }),
  row({ id: "a", name: "Thomas", role: "admin" }),
  row({ id: "m1", name: "Michi", role: "member" }),
  row({ id: "m2", name: "Paul", role: "member" }),
  row({ id: "m3", name: "Rene", role: "member" }),
  row({ id: "m4", name: "Werner", role: "member", emailVerified: false }),
];

describe("<PlayersList>", () => {
  it("groups owner and admins under Admins and counts members", () => {
    render(<PlayersList players={players} />);
    expect(screen.getByText("Admins")).toBeInTheDocument();
    expect(screen.getByText("Mitglieder · 4")).toBeInTheDocument();
    expect(screen.getByText("Besitzer")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("hints at unverified e-mail only for accounts with a password", () => {
    render(
      <PlayersList
        players={[
          row({ id: "u", name: "Uwe", role: "member", emailVerified: false }),
          row({ id: "s", name: "Stats", role: "member", emailVerified: false, hasPassword: false }),
          row({ id: "v", name: "Vera", role: "member" }),
        ]}
      />,
    );
    expect(screen.getAllByText("E-Mail nicht bestätigt")).toHaveLength(1);
  });

  it("links rows to the player detail", () => {
    render(<PlayersList players={players} />);
    expect(screen.getByRole("link", { name: /Paul/ })).toHaveAttribute("href", "/admin/spieler/m2");
  });

  it("filters case-insensitively", async () => {
    render(<PlayersList players={players} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Suchen" }), "pAu");
    expect(screen.getByRole("link", { name: /Paul/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Rene/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Admins")).not.toBeInTheDocument();
    expect(screen.getByText("Mitglieder · 1")).toBeInTheDocument();
  });

  it("shows an empty hint without matches", async () => {
    render(<PlayersList players={players} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Suchen" }), "zzz");
    expect(screen.getByText("Keine Spieler gefunden")).toBeInTheDocument();
  });

  it("opens the create dialog from the plus button", async () => {
    render(<PlayersList players={players} />);
    await userEvent.click(screen.getByRole("button", { name: "Spieler anlegen" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: /Abbrechen/ })).toBeInTheDocument();
  });
});
