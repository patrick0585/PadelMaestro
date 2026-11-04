"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { GroupedList, ListRow, PrimaryAction, SectionFooter, SectionLabel } from "@/components/ui/list";
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

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function usageText(inv: SerializedOpenInvitation) {
  const used = inv.usedCount === 0 ? "unbenutzt" : `${inv.usedCount}× benutzt`;
  return `${used} · bis ${formatDay(inv.expiresAt)}`;
}

const TINTED =
  "min-h-11 flex-1 rounded-xl bg-primary-soft px-3 text-[14.5px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

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
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function onShare(url: string) {
    try {
      await navigator.share({ url });
    } catch (e) {
      // Abbruch durch den Nutzer ist kein Fehler
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(GENERIC_ERROR);
    }
  }

  return (
    <div>
      <form onSubmit={onCreate}>
        <GroupedList>
          <label htmlFor="invitation-note" className="block px-3 pt-2.5 text-[14.5px]">
            Notiz (optional)
          </label>
          <div className="px-3 pb-2.5">
            <Input
              id="invitation-note"
              value={note}
              maxLength={80}
              placeholder="z. B. Dienstagsrunde"
              onChange={(e) => setNote(e.target.value)}
              className="h-11"
            />
          </div>
        </GroupedList>
        <div className="mt-3">
          <PrimaryAction type="submit" disabled={creating}>
            {creating ? "Wird erstellt…" : "Einladungslink erstellen"}
          </PrimaryAction>
        </div>
        <SectionFooter>
          Der Link gilt {TTL_DAYS} Tage und für bis zu {MEMBER_MAX_USES} Beitritte.
        </SectionFooter>
      </form>
      {error && (
        <div className="mt-3">
          <InlineMessage kind="error">{error}</InlineMessage>
        </div>
      )}
      {createdUrl && (
        <>
          <SectionLabel>Neuer Link</SectionLabel>
          <p className="text-sm font-semibold text-foreground sr-only">Dein Link ist fertig</p>
          <Input
            readOnly
            value={createdUrl}
            aria-label="Einladungslink"
            onFocus={(e) => e.currentTarget.select()}
            className="h-11"
          />
          <div className="mt-2 flex gap-2">
            {canCopy && (
              <button type="button" className={TINTED} onClick={() => onCopy(createdUrl)}>
                {copied ? "Kopiert" : "Kopieren"}
              </button>
            )}
            {canShare && (
              <button type="button" className={TINTED} onClick={() => onShare(createdUrl)}>
                Teilen ⇪
              </button>
            )}
          </div>
          <span role="status" aria-live="polite" className="sr-only">
            {copied ? "Link kopiert" : ""}
          </span>
          <SectionFooter>
            {canCopy
              ? "Kopiere den Link jetzt, später wird er nicht mehr angezeigt."
              : "Tippe auf den Link, um ihn zu markieren."}
          </SectionFooter>
        </>
      )}
      <SectionLabel>Offene Links</SectionLabel>
      {invitations.length === 0 ? (
        <GroupedList>
          <ListRow title={<span className="text-foreground-muted">Keine offenen Links</span>} />
        </GroupedList>
      ) : (
        <GroupedList>
          {invitations.map((inv) => (
            <div key={inv.id}>
              <ListRow
                title={<span className="line-clamp-2 whitespace-normal break-words">{inv.note ?? "Einladungslink"}</span>}
                subtitle={usageText(inv)}
                trailing={
                  confirming === inv.id ? undefined : (
                    <button
                      type="button"
                      aria-label={`Link ${inv.note ?? "Einladungslink"} widerrufen`}
                      onClick={() => setConfirming(inv.id)}
                      className="min-h-11 shrink-0 rounded px-1 text-[13px] text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Widerrufen
                    </button>
                  )
                }
              />
              {confirming === inv.id && (
                <div className="flex flex-wrap items-center gap-3 px-3.5 pb-2.5">
                  <span className="text-sm text-foreground">Wirklich widerrufen?</span>
                  <button
                    type="button"
                    disabled={revoking === inv.id}
                    onClick={() => onRevoke(inv.id)}
                    className="min-h-11 rounded px-1 text-[14.5px] font-semibold text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                  >
                    Ja, widerrufen
                  </button>
                  <button
                    type="button"
                    disabled={revoking === inv.id}
                    onClick={() => setConfirming(null)}
                    className="min-h-11 rounded px-1 text-[14.5px] text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                  >
                    Abbrechen
                  </button>
                </div>
              )}
              {inv.uses.length > 0 && (
                <details className="group px-3.5 pb-1 text-sm">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-lg text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                    <ChevronRight
                      className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90"
                      aria-hidden
                    />
                    Beigetreten ({inv.uses.length})
                  </summary>
                  <ul className="space-y-1 pb-2 pl-5 text-foreground">
                    {inv.uses.map((u) => (
                      <li key={u.playerId}>
                        {u.playerName} · {formatDate(u.usedAt)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </GroupedList>
      )}
    </div>
  );
}
