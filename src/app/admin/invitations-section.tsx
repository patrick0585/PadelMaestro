"use client";
import { useState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { InlineMessage } from "@/components/ui/inline-message";
import type { OpenInvitation } from "@/lib/invitations/manage";

export type SerializedOpenInvitation = Omit<OpenInvitation, "expiresAt" | "createdAt" | "uses"> & {
  expiresAt: string;
  createdAt: string;
  uses: { playerId: string; playerName: string; usedAt: string }[];
};

const GENERIC_ERROR = "Unerwarteter Fehler. Bitte erneut versuchen.";

function errorFor(status: number) {
  return status === 429 ? "Zu viele Versuche, bitte später." : GENERIC_ERROR;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function InvitationsSection({ initial }: { initial: SerializedOpenInvitation[] }) {
  const [invitations, setInvitations] = useState(initial);
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      const res = await fetch("/api/invitations");
      if (res.status !== 200) throw new Error();
      setInvitations((await res.json()) as SerializedOpenInvitation[]);
    } catch {
      setError(GENERIC_ERROR);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(note.trim() ? { note: note.trim() } : {}),
      });
      if (res.status !== 201) {
        setError(errorFor(res.status));
        return;
      }
      const body = (await res.json()) as { url: string };
      setCreatedUrl(body.url);
      setCopied(false);
      setNote("");
      await reload();
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(id: string) {
    setRevoking(id);
    setError(null);
    try {
      const res = await fetch(`/api/invitations/${id}`, { method: "DELETE" });
      if (res.status !== 204 && res.status !== 404) {
        setError(errorFor(res.status));
        return;
      }
      setInvitations((list) => list.filter((i) => i.id !== id));
      await reload();
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setRevoking(null);
    }
  }

  async function onCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(GENERIC_ERROR);
    }
  }

  const canCopy = typeof navigator !== "undefined" && navigator.clipboard !== undefined;

  return (
    <Card>
      <CardBody className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Einladen</h2>
          <p className="text-sm text-foreground-muted">
            Link teilen, 14 Tage gültig, bis zu 25 Beitritte.
          </p>
        </div>
        <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-48">
            <Label htmlFor="invitation-note">Notiz (optional)</Label>
            <Input
              id="invitation-note"
              value={note}
              maxLength={80}
              onChange={(e) => setNote(e.target.value)}
              className="h-11"
            />
          </div>
          <Button type="submit" loading={creating}>
            Einladungslink erstellen
          </Button>
        </form>
        {createdUrl && (
          <div className="space-y-2 rounded-xl border border-primary/40 bg-surface-muted p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                readOnly
                value={createdUrl}
                aria-label="Einladungslink"
                onFocus={(e) => e.currentTarget.select()}
                className="h-11 min-w-0 flex-1 basis-56"
              />
              {canCopy && (
                <Button type="button" variant="secondary" onClick={() => onCopy(createdUrl)}>
                  {copied ? "Kopiert" : "Kopieren"}
                </Button>
              )}
            </div>
            <p className="text-xs text-foreground-muted">Der Link ist nur jetzt kopierbar.</p>
          </div>
        )}
        {error && <InlineMessage kind="error">{error}</InlineMessage>}
        {invitations.length === 0 ? (
          <p className="text-sm text-foreground-muted">Noch keine offenen Links.</p>
        ) : (
          <ul className="space-y-2">
            {invitations.map((inv) => (
              <li key={inv.id} className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="truncate font-medium text-foreground">
                      {inv.note ?? "Einladungslink"}
                    </div>
                    <div className="text-xs text-foreground-muted">
                      gültig bis {formatDate(inv.expiresAt)} · {inv.usedCount} von {inv.maxUses}{" "}
                      verwendet
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    loading={revoking === inv.id}
                    onClick={() => onRevoke(inv.id)}
                  >
                    Widerrufen
                  </Button>
                </div>
                {inv.uses.length > 0 && (
                  <details className="text-sm">
                    <summary className="flex min-h-11 cursor-pointer items-center rounded-lg px-1 text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      Beigetreten ({inv.uses.length})
                    </summary>
                    <ul className="space-y-1 px-1 pt-1 text-foreground">
                      {inv.uses.map((u) => (
                        <li key={u.playerId}>
                          {u.playerName} · {formatDate(u.usedAt)}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
