import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/invitations/lookup", () => ({
  previewInvitation: vi.fn(),
  findOwnInvitationUse: vi.fn(),
}));
vi.mock("@/lib/group/active-membership", () => ({ findGroupMembership: vi.fn() }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

import { auth } from "@/auth";
import { previewInvitation, findOwnInvitationUse } from "@/lib/invitations/lookup";
import { findGroupMembership } from "@/lib/group/active-membership";
import Page from "@/app/einladung/[token]/page";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const previewMock = previewInvitation as unknown as ReturnType<typeof vi.fn>;
const ownUseMock = findOwnInvitationUse as unknown as ReturnType<typeof vi.fn>;
const membershipMock = findGroupMembership as unknown as ReturnType<typeof vi.fn>;

const session = {
  user: { id: "p1", email: "p@example.com", name: "P", username: null, isAdmin: false, groupId: null, role: null },
};
const memberPreview = { ok: true, kind: "member", groupId: "g1", groupName: "Dienstagsrunde" };

async function renderPage(token = "tok1") {
  render(await Page({ params: Promise.resolve({ token }) }));
}

beforeEach(() => {
  authMock.mockReset();
  previewMock.mockReset();
  ownUseMock.mockReset().mockResolvedValue(null);
  membershipMock.mockReset().mockResolvedValue(null);
});

describe("Einladungsseite", () => {
  it("zeigt anonym den Grund und den Weg zur Anmeldung bei ungültigem Link", async () => {
    authMock.mockResolvedValue(null);
    previewMock.mockResolvedValue({ ok: false, reason: "expired" });
    await renderPage();
    expect(screen.getByRole("heading", { name: "Einladung ungültig" })).toBeInTheDocument();
    expect(screen.getByText("Dieser Link ist abgelaufen.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zur Anmeldung" })).toHaveAttribute("href", "/login");
  });

  it("zeigt angemeldet bei ungültigem Link den Weg zum Dashboard", async () => {
    authMock.mockResolvedValue(session);
    previewMock.mockResolvedValue({ ok: false, reason: "revoked" });
    await renderPage();
    expect(screen.getByText("Dieser Link wurde zurückgezogen.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zum Dashboard" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "Zur Anmeldung" })).not.toBeInTheDocument();
  });

  it("zeigt anonym bei gültigem Mitglieder-Link das Registrierungsformular", async () => {
    authMock.mockResolvedValue(null);
    previewMock.mockResolvedValue(memberPreview);
    await renderPage();
    expect(screen.getByRole("heading", { name: "Einladung zu Dienstagsrunde" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Konto anlegen" })).toBeInTheDocument();
  });

  it("meldet angemeldeten Mitgliedern, dass sie schon dabei sind", async () => {
    authMock.mockResolvedValue(session);
    previewMock.mockResolvedValue(memberPreview);
    membershipMock.mockResolvedValue({ role: "member" });
    await renderPage();
    expect(screen.getByText("Du bist schon Mitglied von Dienstagsrunde.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zum Dashboard" })).toHaveAttribute("href", "/");
  });

  it("meldet Mitglieder auch bei inzwischen aufgebrauchtem Link als schon dabei", async () => {
    authMock.mockResolvedValue(session);
    previewMock.mockResolvedValue({ ok: false, reason: "exhausted" });
    ownUseMock.mockResolvedValue({ kind: "member", groupId: "g1", groupName: "Dienstagsrunde", foundedGroupId: null });
    membershipMock.mockResolvedValue({ role: "member" });
    await renderPage();
    expect(screen.getByText("Du bist schon Mitglied von Dienstagsrunde.")).toBeInTheDocument();
  });

  it("bietet angemeldeten Nicht-Mitgliedern den Beitritt an", async () => {
    authMock.mockResolvedValue(session);
    previewMock.mockResolvedValue(memberPreview);
    await renderPage();
    expect(screen.getByRole("button", { name: "Gruppe Dienstagsrunde beitreten" })).toBeInTheDocument();
  });

  it("schickt Gründer mit eingelöstem Link ohne Gruppe zum Gründen", async () => {
    authMock.mockResolvedValue(session);
    previewMock.mockResolvedValue({ ok: false, reason: "exhausted" });
    ownUseMock.mockResolvedValue({ kind: "founder", groupId: null, groupName: null, foundedGroupId: null });
    await renderPage();
    expect(screen.getByRole("heading", { name: "Gruppe gründen" })).toBeInTheDocument();
    expect(screen.getByText("Du hast diesen Link schon eingelöst. Gründe jetzt deine Gruppe.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gruppe gründen" })).toHaveAttribute("href", "/gruppe/neu");
  });

  it("meldet Gründern mit gegründeter Gruppe, dass alles erledigt ist", async () => {
    authMock.mockResolvedValue(session);
    previewMock.mockResolvedValue({ ok: false, reason: "exhausted" });
    ownUseMock.mockResolvedValue({ kind: "founder", groupId: null, groupName: null, foundedGroupId: "g9" });
    await renderPage();
    expect(screen.getByRole("heading", { name: "Schon erledigt" })).toBeInTheDocument();
    expect(screen.getByText("Mit diesem Link hast du schon eine Gruppe gegründet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zum Dashboard" })).toHaveAttribute("href", "/");
  });
});
