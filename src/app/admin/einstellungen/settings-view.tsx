"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GroupedList,
  LargeTitle,
  ListRow,
  PrimaryAction,
  SectionFooter,
  SectionLabel,
} from "@/components/ui/list";
import { Input } from "@/components/ui/input";
import { InlineMessage } from "@/components/ui/inline-message";
import type { GroupRules } from "@/lib/group/rules";
import { DeleteGroupDialog } from "../delete-group-dialog";
import { TransferOwnerDialog } from "../transfer-owner-dialog";
import { TransferPicker } from "./transfer-picker";

type Candidate = { id: string; name: string };
const JOKERS_MAX = 10;
const CREDIT_MAX = 30;

function RuleStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const btn =
    "grid size-11 place-items-center rounded-lg text-lg font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <span className="-my-2 -mr-2 inline-flex items-center">
      <button
        type="button"
        aria-label={`${label} verringern`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className={btn}
      >
        −
      </button>
      <span className="min-w-6 text-center text-[15px] font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        aria-label={`${label} erhöhen`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className={btn}
      >
        +
      </button>
    </span>
  );
}

type Message = { kind: "error" | "success"; text: string };

export function SettingsView({
  isOwner,
  groupId,
  name,
  slug,
  rules,
  transferCandidates,
}: {
  isOwner: boolean;
  groupId: string;
  name: string;
  slug: string;
  rules: GroupRules;
  transferCandidates: Candidate[];
}) {
  const router = useRouter();
  const inputId = useId();
  const [value, setValue] = useState(name);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [target, setTarget] = useState<Candidate | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const unchanged = value.trim() === name;
  const [saved, setSaved] = useState(rules);
  const [draft, setDraft] = useState(rules);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesMessage, setRulesMessage] = useState<Message | null>(null);
  const rulesUnchanged =
    draft.jokersPerSeason === saved.jokersPerSeason &&
    draft.jokerGamesCredited === saved.jokerGamesCredited;

  function change(patch: Partial<GroupRules>) {
    setDraft((d) => ({ ...d, ...patch }));
    setRulesMessage(null);
  }

  async function onSaveRules() {
    if (rulesUnchanged) return;
    setRulesSaving(true);
    setRulesMessage(null);
    const res = await fetch("/api/groups/active/rules", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupId, ...draft }),
    }).catch(() => null);
    setRulesSaving(false);
    if (res?.status === 200) {
      const body = (await res.json().catch(() => null)) as GroupRules | null;
      const next = body ?? draft;
      setSaved(next);
      setDraft(next);
      setRulesMessage({ kind: "success", text: "Gespeichert." });
      router.refresh();
      return;
    }
    const err =
      res?.status === 409
        ? ((await res.json().catch(() => null)) as { error?: string; minimum?: number } | null)
        : null;
    setRulesMessage({
      kind: "error",
      text:
        err?.error === "below_used" && typeof err.minimum === "number"
          ? `Mindestens ${err.minimum}, weil schon ${err.minimum} Joker eingesetzt wurden.`
          : err?.error === "stale_group"
            ? "Die aktive Gruppe hat sich geändert. Bitte die Seite neu laden."
            : res?.status === 400
              ? "Ungültige Werte."
              : "Speichern fehlgeschlagen.",
    });
  }

  async function onRename(e: React.FormEvent) {
    e.preventDefault();
    if (unchanged) return;
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/groups/active", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupId, name: value }),
    }).catch(() => null);
    setLoading(false);
    if (res?.status === 200) {
      const body = (await res.json().catch(() => null)) as { name: string } | null;
      if (body) setValue(body.name);
      setMessage({ kind: "success", text: "Gespeichert." });
      router.refresh();
      return;
    }
    const code =
      res?.status === 409
        ? ((await res.json().catch(() => null)) as { error?: string } | null)?.error
        : undefined;
    setMessage({
      kind: "error",
      text:
        code === "stale_group"
          ? "Die aktive Gruppe hat sich geändert. Bitte die Seite neu laden."
          : res?.status === 400
            ? "Der Name muss 2–40 Zeichen lang sein."
            : "Speichern fehlgeschlagen.",
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <LargeTitle title="Einstellungen" back={{ href: "/admin", label: "Verwaltung" }} />

      <SectionLabel>Gruppe</SectionLabel>
      <form onSubmit={onRename}>
        <GroupedList>
          <div className="px-3 py-2.5">
            <label htmlFor={inputId} className="block text-[14.5px]">
              Gruppenname
            </label>
            <Input
              id={inputId}
              className="mt-1 h-11"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setMessage(null);
              }}
              minLength={2}
              maxLength={40}
              required
            />
          </div>
          <ListRow title="Kennung" value={slug} />
          <button
            type="submit"
            disabled={unchanged || loading}
            className="relative flex min-h-11 w-full items-center px-3.5 text-left text-[14.5px] text-primary before:absolute before:left-3.5 before:right-0 before:top-0 before:h-px before:bg-border before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            <span
              className={`rounded-lg bg-primary-soft px-3 py-1.5 font-semibold text-primary ${unchanged || loading ? "opacity-50" : ""}`.trim()}
            >
              Umbenennen
            </span>
          </button>
        </GroupedList>
        {message && (
          <div className="mt-2">
            <InlineMessage kind={message.kind}>{message.text}</InlineMessage>
          </div>
        )}
      </form>

      <SectionLabel>Spielregeln</SectionLabel>
      <GroupedList>
        <ListRow
          title="Joker pro Saison"
          trailing={
            <RuleStepper
              label="Joker pro Saison"
              value={draft.jokersPerSeason}
              min={0}
              max={JOKERS_MAX}
              onChange={(v) => change({ jokersPerSeason: v })}
            />
          }
        />
        <ListRow
          title="Spiele pro Joker"
          trailing={
            <RuleStepper
              label="Spiele pro Joker"
              value={draft.jokerGamesCredited}
              min={1}
              max={CREDIT_MAX}
              onChange={(v) => change({ jokerGamesCredited: v })}
            />
          }
        />
        <ListRow title="Spieler pro Spieltag" value="4–6" />
      </GroupedList>
      <SectionFooter>
        Änderungen gelten sofort. Bereits eingesetzte Joker bleiben unverändert.
      </SectionFooter>
      {rulesMessage && (
        <div className="mt-2">
          <InlineMessage kind={rulesMessage.kind}>{rulesMessage.text}</InlineMessage>
        </div>
      )}
      <div className="mt-3">
        <PrimaryAction onClick={onSaveRules} disabled={rulesUnchanged || rulesSaving}>
          Sichern
        </PrimaryAction>
      </div>

      {isOwner && (
        <>
          {transferCandidates.length > 0 && (
            <>
              <SectionLabel>Besitz</SectionLabel>
              <GroupedList>
                <ListRow
                  title="Besitz übertragen…"
                  tone="primary"
                  onClick={() => setPickerOpen(true)}
                />
              </GroupedList>
            </>
          )}
          <GroupedList className="mt-4">
            <ListRow
              title="Gruppe löschen"
              tone="destructive"
              align="center"
              onClick={() => setDeleteOpen(true)}
            />
          </GroupedList>
          <TransferPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            candidates={transferCandidates}
            onPick={(c) => {
              setPickerOpen(false);
              setTarget(c);
            }}
          />
          <TransferOwnerDialog open={target !== null} onClose={() => setTarget(null)} player={target} />
          <DeleteGroupDialog
            open={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            groupId={groupId}
            name={name}
          />
        </>
      )}
    </div>
  );
}
