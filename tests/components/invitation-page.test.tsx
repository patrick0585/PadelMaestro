import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const auth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => auth() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/invitations/lookup", () => ({
  findOwnInvitationUse: vi.fn(),
  previewInvitation: vi.fn().mockResolvedValue({ ok: true, kind: "member", groupId: "g1", groupName: "Die Smasher" }),
}));
vi.mock("@/lib/group/active-membership", () => ({ findGroupMembership: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/auth/apple/config", () => ({ appleConfigured: () => false }));
vi.mock("@/app/einladung/[token]/signup-form", () => ({ SignupForm: () => <form aria-label="signup" /> }));
vi.mock("@/app/einladung/[token]/join-button", () => ({ JoinButton: () => <button>join</button> }));
vi.mock("@/components/legal-footer", () => ({ LegalFooter: () => null }));

import InvitationPage from "@/app/einladung/[token]/page";

const HINT = "Lege ein Konto an oder melde dich an, um beizutreten.";

describe("Einladungsseite", () => {
  it("erklärt Abgemeldeten, was zu tun ist", async () => {
    auth.mockResolvedValue(null);
    render(await InvitationPage({ params: Promise.resolve({ token: "t" }) }));
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Einladung zu Die Smasher" })).toBeInTheDocument();
  });

  it("zeigt den Hinweis nicht für angemeldete Nutzer", async () => {
    auth.mockResolvedValue({ user: { id: "p1" } });
    render(await InvitationPage({ params: Promise.resolve({ token: "t" }) }));
    expect(screen.queryByText(HINT)).toBeNull();
    expect(screen.getByRole("button", { name: "join" })).toBeInTheDocument();
  });
});
