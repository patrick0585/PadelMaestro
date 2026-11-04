"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { GroupedList, LargeTitle, ListRow, SectionFooter, SectionLabel } from "@/components/ui/list";
import { Input } from "@/components/ui/input";
import { InlineMessage } from "@/components/ui/inline-message";
import { DeleteGroupDialog } from "../delete-group-dialog";
import { TransferOwnerDialog } from "../transfer-owner-dialog";
import { TransferPicker } from "./transfer-picker";

type Candidate = { id: string; name: string };
type Message = { kind: "error" | "success"; text: string };

export function SettingsView({
  isOwner,
  groupId,
  name,
  slug,
  maxJokers,
  transferCandidates,
}: {
  isOwner: boolean;
  groupId: string;
  name: string;
  slug: string;
  maxJokers: number;
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
      {isOwner ? (
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
              className="relative flex min-h-11 w-full items-center px-3.5 text-left text-[14.5px] text-primary before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-border before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-50"
            >
              Umbenennen
            </button>
          </GroupedList>
          {message && (
            <div className="mt-2">
              <InlineMessage kind={message.kind}>{message.text}</InlineMessage>
            </div>
          )}
        </form>
      ) : (
        <GroupedList>
          <ListRow title="Name" value={name} />
          <ListRow title="Kennung" value={slug} />
        </GroupedList>
      )}

      <SectionLabel>Spielregeln</SectionLabel>
      <GroupedList>
        <ListRow title="Joker pro Saison" value={maxJokers} />
        <ListRow title="Spieler pro Spieltag" value="4–6" />
      </GroupedList>
      <SectionFooter>Regeln sind in Version 1 fest. Anpassbar kommt später.</SectionFooter>

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
