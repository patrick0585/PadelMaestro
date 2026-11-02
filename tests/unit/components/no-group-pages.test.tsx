import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({
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
