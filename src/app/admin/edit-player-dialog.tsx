"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { isValidUsername, normaliseUsername } from "@/lib/auth/username";

export interface EditablePlayer {
  id: string;
  name: string;
  email: string;
  username: string | null;
  isAdmin: boolean;
}

export function EditPlayerDialog({
  open,
  onClose,
  player,
}: {
  open: boolean;
  onClose: () => void;
  player: EditablePlayer | null;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && player) {
      setName(player.name);
      setEmail(player.email);
      setUsername(player.username ?? "");
      setIsAdmin(player.isAdmin);
      setError(null);
    }
  }, [open, player]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!player) return;
    setError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();
    const normalisedUsername = trimmedUsername ? normaliseUsername(trimmedUsername) : "";

    if (trimmedUsername && !isValidUsername(normalisedUsername)) {
      setError("Benutzername: 3–32 Zeichen, nur Kleinbuchstaben, Ziffern und Unterstriche");
      return;
    }

    const diff: Record<string, unknown> = {};
    if (trimmedName !== player.name) diff.name = trimmedName;
    if (trimmedEmail !== player.email) diff.email = trimmedEmail;
    if (normalisedUsername !== (player.username ?? "")) {
      diff.username = normalisedUsername || undefined;
    }
    if (isAdmin !== player.isAdmin) diff.isAdmin = isAdmin;

    if (Object.keys(diff).length === 0) {
      onClose();
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/players/${player.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(diff),
    });
    setLoading(false);

    if (res.ok) {
      onClose();
      router.refresh();
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 409 && body.error === "username_taken") {
      setError("Dieser Benutzername ist bereits vergeben");
    } else if (res.status === 409 && body.error === "email_taken") {
      setError("Diese E-Mail ist bereits vergeben");
    } else if (res.status === 409 && body.error === "last_admin") {
      setError("Der letzte verbleibende Admin kann nicht degradiert werden");
    } else if (res.status === 400) {
      setError("Eingabe ungültig");
    } else if (res.status === 404) {
      setError("Spieler nicht gefunden");
    } else {
      setError("Speichern fehlgeschlagen");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Spieler bearbeiten — ${player?.name ?? ""}`}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="edit-player-name">Anzeigename</Label>
          <Input
            id="edit-player-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="edit-player-email">E-Mail</Label>
          <Input
            id="edit-player-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="edit-player-username">Benutzername (optional)</Label>
          <Input
            id="edit-player-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="z. B. alice_42"
            autoComplete="off"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
          />
          Admin-Rechte
        </label>
        {error && (
          <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Abbrechen
          </Button>
          <Button type="submit" loading={loading}>
            Speichern
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
