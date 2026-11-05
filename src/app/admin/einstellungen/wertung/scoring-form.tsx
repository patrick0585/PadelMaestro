"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { GroupedList, ListRow, PrimaryAction, SectionFooter, SectionLabel } from "@/components/ui/list";
import { InlineMessage } from "@/components/ui/inline-message";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  FIXED_GAMES,
  SET_MAX_EXTRA,
  SET_TARGET_MAX,
  SET_TARGET_MIN,
  examplesFor,
  hintFor,
  type PlayerCountKey,
  type ScoringRule,
} from "@/lib/scoring/rule";
import { RuleStepper } from "../rule-stepper";

const MODES = [
  { mode: "fixed", label: "Feste Spielzahl" },
  { mode: "set", label: "Satz" },
] as const;

function defaultFor(mode: ScoringRule["mode"]): ScoringRule {
  return mode === "fixed" ? { mode: "fixed", games: 3 } : { mode: "set", target: 6, max: 7 };
}

const sameRule = (a: ScoringRule, b: ScoringRule) => JSON.stringify(a) === JSON.stringify(b);

function Chips({ items, ok }: { items: string[]; ok: boolean }) {
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">
      {items.map((x) => (
        <li
          key={x}
          className={`rounded-lg border px-2 py-0.5 font-display text-base font-extrabold tabular-nums ${
            ok ? "border-lime/35 bg-lime/15 text-lime" : "border-rose-400/30 bg-rose-400/10 text-rose-300 line-through"
          }`}
        >
          <span className="sr-only">{ok ? "gültig: " : "ungültig: "}</span>
          {x}
        </li>
      ))}
    </ul>
  );
}

export function ScoringForm({
  groupId,
  playerCount,
  initial,
  finishedDaysThisSeason,
}: {
  groupId: string;
  playerCount: PlayerCountKey;
  initial: ScoringRule;
  finishedDaysThisSeason: number;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [rule, setRule] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const unchanged = sameRule(rule, saved);
  const midSeason = finishedDaysThisSeason > 0;
  const ex = examplesFor(rule);

  function update(next: ScoringRule) {
    setMessage(null);
    setRule(next);
  }

  async function save() {
    setConfirming(false);
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/groups/active/scoring", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupId, playerCount: Number(playerCount), rule }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMessage({
        kind: "error",
        text:
          res?.status === 409
            ? "Die aktive Gruppe hat sich geändert – Seite neu laden."
            : res?.status === 403
              ? "Nur Admins dürfen die Wertung ändern."
              : "Konnte nicht gesichert werden.",
      });
      return;
    }
    setSaved(rule);
    setMessage({ kind: "success", text: "Gesichert. Gilt ab dem nächsten Spieltag." });
    router.refresh();
  }

  return (
    <>
      <SectionLabel>Wertungsart</SectionLabel>
      <div role="radiogroup" aria-label="Wertungsart" className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-muted p-1">
        {MODES.map((m) => {
          const on = rule.mode === m.mode;
          return (
            <button
              key={m.mode}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => !on && update(m.mode === saved.mode ? saved : defaultFor(m.mode))}
              className={`min-h-10 rounded-lg text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                on ? "bg-surface-elevated text-foreground" : "text-foreground-muted"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {rule.mode === "fixed" ? (
        <>
          <SectionLabel>Feste Spielzahl</SectionLabel>
          <GroupedList>
            <ListRow
              title="Spiele pro Partie"
              trailing={
                <RuleStepper
                  label="Spiele pro Partie"
                  value={rule.games}
                  min={FIXED_GAMES[0]}
                  max={FIXED_GAMES[FIXED_GAMES.length - 1]}
                  step={2}
                  onChange={(games) => update({ mode: "fixed", games })}
                />
              }
            />
          </GroupedList>
          <SectionFooter>
            Jede Partie hat genau so viele Spiele, die Summe des Ergebnisses ist fest. Nur ungerade Werte, damit es kein
            Unentschieden gibt.
          </SectionFooter>
        </>
      ) : (
        <>
          <SectionLabel>Satz</SectionLabel>
          <GroupedList>
            <ListRow
              title="Satz bis"
              trailing={
                <RuleStepper
                  label="Satz bis"
                  value={rule.target}
                  min={SET_TARGET_MIN}
                  max={SET_TARGET_MAX}
                  onChange={(target) =>
                    update({
                      mode: "set",
                      target,
                      max: Math.min(Math.max(rule.max, target), target + SET_MAX_EXTRA),
                    })
                  }
                />
              }
            />
            <ListRow
              title="Höchstens"
              trailing={
                <RuleStepper
                  label="Höchstens"
                  value={rule.max}
                  min={rule.target}
                  max={rule.target + SET_MAX_EXTRA}
                  onChange={(max) => update({ ...rule, max })}
                />
              }
            />
          </GroupedList>
          <SectionFooter>
            Der Gewinner braucht mindestens {rule.target} Spiele.{" "}
            {rule.max > rule.target
              ? `Mit „höchstens ${rule.max}“ geht es nach ${rule.target}:${rule.target - 1} oder ${rule.target}:${rule.target} weiter.`
              : "Ohne Verlängerung."}
          </SectionFooter>
        </>
      )}

      <SectionLabel>Beispiele</SectionLabel>
      <GroupedList className="space-y-2.5 px-3.5 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Gültig</p>
          <Chips items={ex.valid} ok />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Nicht gültig</p>
          <Chips items={ex.invalid} ok={false} />
        </div>
      </GroupedList>
      <SectionFooter>Am Spieltag steht unter der Eingabe: „{hintFor(rule)}“</SectionFooter>

      {midSeason && !unchanged && (
        <div className="mt-3">
          <InlineMessage kind="error">
            Die Saison läuft schon ({finishedDaysThisSeason} {finishedDaysThisSeason === 1 ? "Spieltag" : "Spieltage"}).
            Punkte pro Spiel sind danach nicht mehr direkt mit den bisherigen Spieltagen vergleichbar.
          </InlineMessage>
        </div>
      )}
      {message && (
        <div className="mt-3">
          <InlineMessage kind={message.kind}>{message.text}</InlineMessage>
        </div>
      )}
      <div className="mt-3">
        <PrimaryAction onClick={() => (midSeason ? setConfirming(true) : void save())} disabled={unchanged || busy}>
          Sichern
        </PrimaryAction>
      </div>

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Wertung mitten in der Saison ändern?">
        <p className="text-sm text-foreground-muted">
          Die neue Regel gilt ab dem nächsten Spieltag. Bisherige Ergebnisse bleiben, wie sie sind, aber die Punkte pro
          Spiel in der Rangliste mischen dann zwei Wertungen. Am saubersten ist eine Änderung zum Saisonstart.
        </p>
        <div className="mt-4 grid gap-2">
          <Button onClick={() => void save()}>Trotzdem ändern</Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Abbrechen
          </Button>
        </div>
      </Dialog>
    </>
  );
}
