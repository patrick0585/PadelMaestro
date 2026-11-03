import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    player: {
      findUnique: vi.fn().mockResolvedValue({
        avatarVersion: 0,
        email: "p@example.com",
        emailVerifiedAt: new Date(),
        pendingEmail: null,
      }),
    },
    group: { findUnique: vi.fn() },
  },
}));
vi.mock("@/components/email-notice", () => ({ EmailNotice: () => null }));
vi.mock("@/lib/group/create", () => ({ canFoundGroup: vi.fn().mockResolvedValue(false) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import { auth } from "@/auth";
import RankingPage from "@/app/ranking/page";
import GameDayPage from "@/app/game-day/page";
import ArchivePage from "@/app/archive/page";
import DashboardPage from "@/app/page";
import AdminPage from "@/app/admin/page";
import ProfilePage from "@/app/profil/page";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;

const groupless = {
  user: {
    id: "p1",
    email: "p@example.com",
    name: "P",
    username: null,
    isAdmin: false,
    groupId: null,
    role: null,
  },
};

describe.each([
  ["RankingPage", RankingPage],
  ["GameDayPage", GameDayPage],
  ["ArchivePage", ArchivePage],
  ["DashboardPage", DashboardPage],
])("%s ohne Gruppe", (_name, Page) => {
  it("zeigt den Leerzustand", async () => {
    authMock.mockResolvedValue(groupless);
    render(await Page());
    expect(screen.getByText("Du bist in keiner Gruppe")).toBeInTheDocument();
  });

  it("leitet ohne Session zum Login", async () => {
    authMock.mockResolvedValue(null);
    await expect(Page()).rejects.toThrow("REDIRECT:/login");
  });
});

describe("AdminPage ohne Gruppe", () => {
  it("leitet zur Rangliste", async () => {
    authMock.mockResolvedValue(groupless);
    await expect(AdminPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/ranking");
  });
});

describe("ProfilePage ohne Gruppe", () => {
  it("lässt die Karte Gruppe weg", async () => {
    authMock.mockResolvedValue(groupless);
    render(await ProfilePage());
    expect(screen.getByText("Passwort ändern")).toBeInTheDocument();
    expect(screen.getAllByRole("navigation", { name: "Rechtliches" })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Gruppe" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Gruppe verlassen" })).toBeNull();
  });
});
