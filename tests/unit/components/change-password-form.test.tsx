import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const signInWithApple = vi.fn();
vi.mock("@/lib/native/apple-sign-in", () => ({
  signInWithApple: () => signInWithApple(),
  isAppleCancel: (e: { code?: string } | null) => e?.code === "SIGN_IN_CANCELED",
}));
import { ChangePasswordForm } from "@/app/profil/change-password-form";

beforeEach(() => {
  refresh.mockReset();
  signInWithApple.mockReset().mockResolvedValue({ identityToken: "apple-tok" });
});
afterEach(() => vi.unstubAllGlobals());

function fill(newPw = "neues-passwort-1") {
  fireEvent.change(screen.getByLabelText(/Neues Passwort \(min/), { target: { value: newPw } });
  fireEvent.change(screen.getByLabelText("Neues Passwort bestätigen"), { target: { value: newPw } });
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
}

describe("ChangePasswordForm", () => {
  it("sendet bei Apple-Konten den frischen Apple-Token statt eines aktuellen Passworts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 204, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(<ChangePasswordForm hasPassword={false} />);
    fill();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      identityToken: "apple-tok",
      newPassword: "neues-passwort-1",
    });
  });

  it("sendet bei Passwort-Konten das aktuelle Passwort und fragt Apple nicht", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 204, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(<ChangePasswordForm />);
    fireEvent.change(screen.getByLabelText("Aktuelles Passwort"), { target: { value: "alt-passwort" } });
    fill();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      currentPassword: "alt-passwort",
      newPassword: "neues-passwort-1",
    });
    expect(signInWithApple).not.toHaveBeenCalled();
  });

  it("bricht still ab, wenn die Apple-Bestätigung abgebrochen wird", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    signInWithApple.mockRejectedValue({ code: "SIGN_IN_CANCELED" });
    render(<ChangePasswordForm hasPassword={false} />);
    fill();
    await waitFor(() => expect(signInWithApple).toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("zeigt eine Meldung bei 403 apple_reauth_required", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 403, json: async () => ({}) }));
    render(<ChangePasswordForm hasPassword={false} />);
    fill();
    expect(await screen.findByRole("alert")).toHaveTextContent("Bestätigung mit Apple");
  });
});
