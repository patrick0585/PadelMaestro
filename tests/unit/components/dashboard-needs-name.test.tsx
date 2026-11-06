import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/auth", () => ({ auth: () => authMock() }));
const needsNameMock = vi.fn();
vi.mock("@/lib/account/apple", () => ({ needsName: (id: string) => needsNameMock(id) }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
import DashboardPage from "@/app/page";

describe("Startseite: Namensschritt", () => {
  beforeEach(() => {
    authMock.mockReset();
    needsNameMock.mockReset();
  });

  it("schickt Apple-Konten ohne Namen zu /willkommen/name", async () => {
    authMock.mockResolvedValue({ user: { id: "p1", groupId: null } });
    needsNameMock.mockResolvedValue(true);
    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/willkommen/name");
    expect(needsNameMock).toHaveBeenCalledWith("p1");
  });

  it("schickt Anonyme zum Login, ohne nach dem Namen zu fragen", async () => {
    authMock.mockResolvedValue(null);
    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/login");
    expect(needsNameMock).not.toHaveBeenCalled();
  });
});
