"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { isAppleCancel, signInWithApple } from "@/lib/native/apple-sign-in";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export function ChangePasswordForm({ hasPassword = true }: { hasPassword?: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setStatus({ kind: "error", message: "Die neuen Passwörter stimmen nicht überein." });
      return;
    }
    setStatus({ kind: "submitting" });
    let res: Response;
    try {
      const proof = hasPassword
        ? { currentPassword }
        : { identityToken: (await signInWithApple()).identityToken };
      res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...proof, newPassword }),
      });
    } catch (e) {
      setStatus(
        isAppleCancel(e)
          ? { kind: "idle" }
          : { kind: "error", message: "Unerwarteter Fehler. Bitte erneut versuchen." },
      );
      return;
    }
    if (res.status === 204) {
      setStatus({ kind: "success" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      if (!hasPassword) router.refresh();
      return;
    }
    if (res.status === 401) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (body.error === "unauthorized") {
        window.location.href = "/login";
        return;
      }
      setStatus({ kind: "error", message: "Aktuelles Passwort ist falsch." });
      return;
    }
    if (res.status === 403) {
      setStatus({ kind: "error", message: "Die Bestätigung mit Apple hat nicht geklappt. Bitte versuche es erneut." });
      return;
    }
    if (res.status === 400) {
      setStatus({ kind: "error", message: "Neues Passwort muss mindestens 8 Zeichen haben." });
      return;
    }
    setStatus({ kind: "error", message: "Unerwarteter Fehler. Bitte erneut versuchen." });
  }

  const submitting = status.kind === "submitting";

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {hasPassword && (
        <div>
          <Label htmlFor="current-password">Aktuelles Passwort</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
      )}
      <div>
        <Label htmlFor="new-password">Neues Passwort (min. 8 Zeichen)</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="confirm-password">Neues Passwort bestätigen</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>
      {status.kind === "error" && (
        <p
          role="alert"
          className="rounded-xl bg-destructive-soft/40 px-3 py-2 text-sm text-destructive"
        >
          {status.message}
        </p>
      )}
      {status.kind === "success" && (
        <p
          role="status"
          className="rounded-xl bg-success-soft/40 px-3 py-2 text-sm text-success"
        >
          {hasPassword ? "Passwort erfolgreich geändert." : "Passwort festgelegt. Du kannst dich jetzt auch mit E-Mail anmelden."}
        </p>
      )}
      {!hasPassword && (
        <p className="text-sm text-foreground-muted">Zur Bestätigung meldest du dich kurz mit Apple an.</p>
      )}
      <div className="flex justify-end">
        <Button type="submit" loading={submitting}>
          Speichern
        </Button>
      </div>
    </form>
  );
}
