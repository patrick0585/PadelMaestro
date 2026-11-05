"use client";
import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { canIncrement, hintFor, invalidReason, type ScoringRule } from "@/lib/scoring/rule";

export interface EditableMatch {
  id: string;
  matchNumber: number;
  team1: [string, string];
  team2: [string, string];
  team1Score: number | null;
  team2Score: number | null;
  version: number;
}

async function saveErrorText(res: Response): Promise<string> {
  if (res.status === 409) return "Zwischenzeitlich geändert – Seite neu laden.";
  if (res.status === 403) return "Du darfst dieses Ergebnis nicht eintragen.";
  if (res.status === 400) {
    // The server explains invalid scores in German (src/lib/scoring/rule.ts).
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return body?.error && body.error !== "Invalid body" ? `${body.error}.` : "Ungültiges Ergebnis.";
  }
  return `Konnte Ergebnis nicht speichern (HTTP ${res.status}).`;
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function Counter({
  names,
  value,
  canIncrement,
  leading,
  size,
  onChange,
}: {
  names: [string, string];
  value: number;
  canIncrement: boolean;
  leading: boolean;
  size: "hero" | "row";
  onChange: (n: number) => void;
}) {
  const hero = size === "hero";
  const team = names.join(" & ");
  const base = `grid min-h-12 place-items-center rounded-xl border text-2xl font-bold touch-manipulation transition ${FOCUS}`;
  const minus = `${base} ${hero ? "border-white/35 bg-black/30 text-white disabled:text-white/45" : "border-border-strong bg-surface-muted text-foreground disabled:text-foreground-muted"} disabled:border-white/15`;
  const plus = `${base} ${hero ? "border-lime/70 bg-lime/15 text-lime" : "border-primary/60 bg-primary-soft text-primary"} disabled:opacity-40`;
  return (
    <div className="min-w-0 text-center">
      <p className={`truncate text-[13px] leading-tight ${hero ? "text-[#d9f6fb]" : "text-foreground-muted"}`}>
        <b className={`block truncate text-base ${hero ? "text-white" : "text-foreground"}`}>{names[0]}</b>
        {names[1]}
      </p>
      <div className="mt-2 grid grid-cols-[48px_1fr_48px] items-center gap-1.5">
        <button type="button" className={minus} aria-label={`Punkt für ${team} entfernen`} disabled={value <= 0} onClick={() => onChange(value - 1)}>
          −
        </button>
        <output className={`font-display font-extrabold leading-none tabular-nums ${hero ? "text-[52px]" : "text-[40px]"} ${leading ? "text-lime" : ""}`}>
          {value}
        </output>
        <button type="button" className={plus} aria-label={`Punkt für ${team} hinzufügen`} disabled={!canIncrement} onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  );
}

export function ScoreEditor({
  match,
  rule,
  size,
  onSaved,
  onCancel,
}: {
  match: EditableMatch;
  rule: ScoringRule;
  size: "hero" | "row";
  onSaved?: (score: [number, number]) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const hintId = useId();
  const [t1, setT1] = useState(match.team1Score ?? 0);
  const [t2, setT2] = useState(match.team2Score ?? 0);
  // Version the user's edit is based on. While untouched, follow live updates;
  // once touched, keep it so the server rejects a save over someone else's change.
  const [baseVersion, setBaseVersion] = useState(match.version);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBusy(false);
    if (dirty) return;
    setT1(match.team1Score ?? 0);
    setT2(match.team2Score ?? 0);
    setBaseVersion(match.version);
    // Only react to new server data, not to local edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.version, match.team1Score, match.team2Score]);

  const reason = invalidReason(rule, t1, t2);
  const valid = reason === null;
  const untouchedZero = t1 === 0 && t2 === 0;
  const hint = valid || untouchedZero ? hintFor(rule) : reason;
  const hero = size === "hero";

  const edit = (setter: (n: number) => void) => (n: number) => {
    setDirty(true);
    setError(null);
    setter(n);
  };

  async function save() {
    setBusy(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch(`/api/matches/${match.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ team1Score: t1, team2Score: t2, expectedVersion: baseVersion }),
      });
    } catch {
      setBusy(false);
      setError("Keine Verbindung – bitte erneut versuchen.");
      return;
    }
    if (!res.ok) {
      setBusy(false);
      setError(await saveErrorText(res));
      return;
    }
    // Stay busy until the refreshed match arrives (version changes), so a second
    // tap can't resend the old version.
    setDirty(false);
    onSaved?.([t1, t2]);
    router.refresh();
  }

  return (
    <div>
      <div
        className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl p-3 ${hero ? "bg-black/50" : "bg-surface-muted"}`}
        role="group"
        aria-label={`Ergebnis Match ${match.matchNumber}`}
      >
        <Counter names={match.team1} value={t1} canIncrement={canIncrement(rule, t1, t2)} leading={valid && t1 > t2} size={size} onChange={edit(setT1)} />
        <span aria-hidden="true" className={`mt-8 font-display text-[36px] font-extrabold ${hero ? "text-[#7dd3e0]" : "text-foreground-muted"}`}>
          :
        </span>
        <Counter names={match.team2} value={t2} canIncrement={canIncrement(rule, t2, t1)} leading={valid && t2 > t1} size={size} onChange={edit(setT2)} />
      </div>
      <p
        id={hintId}
        className={`mt-2 text-center text-[13px] ${
          !valid && !untouchedZero ? "font-semibold text-amber-300" : hero ? "text-[#d9f6fb]" : "text-foreground-muted"
        }`}
      >
        {hint}
      </p>
      <div className={`mt-2 grid gap-2 ${onCancel ? "grid-cols-[1fr_auto]" : ""}`}>
        <button
          type="button"
          aria-describedby={hintId}
          disabled={!valid || busy}
          onClick={save}
          className={`min-h-12 rounded-[14px] text-[15px] font-bold transition ${FOCUS} ${
            valid
              ? "bg-lime text-background disabled:opacity-70"
              : hero
                ? "border border-white/25 bg-black/30 text-white/70"
                : "border border-border-strong bg-surface-muted text-foreground-muted"
          }`}
        >
          {busy ? "…" : valid ? `Speichern · ${t1}:${t2}` : "Speichern"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={`min-h-12 rounded-[14px] border border-border px-4 text-sm font-semibold text-foreground ${FOCUS}`}>
            Abbrechen
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className={`mt-2 rounded-xl px-3 py-2 text-sm ${hero ? "bg-black/40 text-rose-200" : "bg-destructive-soft text-destructive"}`}>
          {error}
        </p>
      )}
    </div>
  );
}
