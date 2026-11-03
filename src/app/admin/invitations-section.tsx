"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { InlineMessage } from "@/components/ui/inline-message";
import type { OpenInvitation } from "@/lib/invitations/manage";
import { MEMBER_MAX_USES, MEMBER_TTL_MS } from "@/lib/invitations/constants";

export type SerializedOpenInvitation = Omit<OpenInvitation, "expiresAt" | "createdAt" | "uses"> & {
  expiresAt: string;
  createdAt: string;
  uses: { playerId: string; playerName: string; usedAt: string }[];
};

const TTL_DAYS = MEMBER_TTL_MS / 86_400_000;
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
  const [confirming, setConfirming] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);
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
      setConfirming(null);
    }
  }

  async function onCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
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
            Teile den Link. Er gilt {TTL_DAYS} Tage und für bis zu {MEMBER_MAX_USES} Beitritte.
          </p>
        </div>
        <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-48">
            <Label htmlFor="invitation-note">Notiz (optional)</Label>
            <Input
              id="invitation-note"
              value={note}
              maxLength={80}
              placeholder="z. B. Dienstagsrunde"
              onChange={(e) => setNote(e.target.value)}
              className="h-11"
            />
          </div>
          <Button type="submit" loading={creating} className="w-full sm:w-auto">
            Einladungslink erstellen
          </Button>
        </form>
        {createdUrl && (
          <div className="space-y-2 rounded-xl border border-primary bg-primary/10 p-3">
            <p className="text-sm font-semibold text-foreground">Dein Link ist fertig</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                readOnly
                value={createdUrl}
                aria-label="Einladungslink"
                onFocus={(e) => e.currentTarget.select()}
                className="h-11 min-w-0 flex-1 basis-56"
              />
              {canCopy && (
                <>
                  <Button type="button" onClick={() => onCopy(createdUrl)}>
                    {copied ? "Kopiert" : "Kopieren"}
                  </Button>
                  <span role="status" aria-live="polite" className="sr-only">
                    {copied ? "Link kopiert" : ""}
                  </span>
                </>
              )}
            </div>
            <p className="text-sm text-foreground">
              {canCopy
                ? "Kopiere den Link jetzt, später wird er nicht mehr angezeigt."
                : "Tippe auf den Link, um ihn zu markieren."}
            </p>
          </div>
        )}
        {error && <InlineMessage kind="error">{error}</InlineMessage>}
        {invitations.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            Noch keine offenen Links. Erstelle oben einen und teile ihn.
          </p>
        ) : (
          <ul className="space-y-2">
            {invitations.map((inv) => (
              <li key={inv.id} className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="line-clamp-2 break-words font-medium text-foreground">
                      {inv.note ?? "Einladungslink"}
                    </div>
                    <div className="text-xs text-foreground-muted">
                      gültig bis {formatDate(inv.expiresAt)} · {inv.usedCount} von {inv.maxUses}{" "}
                      verwendet
                    </div>
                  </div>
                  {confirming === inv.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-foreground">Wirklich widerrufen?</span>
                      <Button
                        type="button"
                        variant="destructive"
                        loading={revoking === inv.id}
                        onClick={() => onRevoke(inv.id)}
                      >
                        Ja, widerrufen
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={revoking === inv.id}
                        onClick={() => setConfirming(null)}
                      >
                        Abbrechen
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Link ${inv.note ?? "Einladungslink"} widerrufen`}
                      onClick={() => setConfirming(inv.id)}
                    >
                      Widerrufen
                    </Button>
                  )}
                </div>
                {inv.uses.length > 0 && (
                  <details className="group text-sm">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-lg px-1 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                      <ChevronRight
                        className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90"
                        aria-hidden
                      />
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
