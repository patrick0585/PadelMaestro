"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { isValidUsername } from "@/lib/auth/username";

export function CreatePlayerDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEmail("");
    setName("");
    setUsername("");
    setPassword("");
    setIsAdmin(false);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedUsername = username.trim();
    if (trimmedUsername && !isValidUsername(trimmedUsername.toLowerCase())) {
      setError(
        "Benutzername: 3–32 Zeichen, nur Kleinbuchstaben, Ziffern und Unterstriche",
      );
      return;
    }
    setLoading(true);
    const res = await fetch("/api/players", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        name,
        password,
        isAdmin,
        username: trimmedUsername || undefined,
      }),
    });
    setLoading(false);
    if (res.status === 409) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (body.error === "username_taken") {
        setError("Dieser Benutzername ist bereits vergeben");
      } else {
        setError("Ein Spieler mit dieser E-Mail existiert bereits");
      }
      return;
    }
    if (!res.ok) {
      setError("Anlegen fehlgeschlagen");
      return;
    }
    reset();
    onClose();
    router.refresh();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Spieler anlegen">
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="new-player-name">Name</Label>
          <Input
            id="new-player-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="new-player-email">E-Mail</Label>
          <Input
            id="new-player-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="new-player-username">Benutzername (optional)</Label>
          <Input
            id="new-player-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="z. B. alice_42"
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor="new-player-password">Passwort (min. 8 Zeichen)</Label>
          <Input
            id="new-player-password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
          />
          Admin-Rechte vergeben
        </label>
        {error && (
          <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Abbrechen
          </Button>
          <Button type="submit" loading={loading}>
            Anlegen
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
