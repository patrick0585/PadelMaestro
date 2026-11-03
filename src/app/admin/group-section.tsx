"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { InlineMessage } from "@/components/ui/inline-message";
import { DeleteGroupDialog } from "./delete-group-dialog";

export function GroupSection({ name }: { name: string }) {
  const router = useRouter();
  const inputId = useId();
  const [value, setValue] = useState(name);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
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
      body: JSON.stringify({ name: value }),
    }).catch(() => null);
    setLoading(false);
    if (res?.status === 200) {
      const body = (await res.json().catch(() => null)) as { name: string } | null;
      if (body) setValue(body.name);
      setMessage({ kind: "success", text: "Gespeichert." });
      router.refresh();
      return;
    }
    setMessage({
      kind: "error",
      text: res?.status === 400 ? "Der Name muss 2–40 Zeichen lang sein." : "Speichern fehlgeschlagen.",
    });
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">Gruppe</h2>
        <form onSubmit={onRename} className="space-y-2">
          <Label htmlFor={inputId}>Gruppenname</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={inputId}
              className="min-w-0 flex-1"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setMessage(null);
              }}
              minLength={2}
              maxLength={40}
              required
            />
            <Button type="submit" variant="secondary" loading={loading} disabled={unchanged}>
              Umbenennen
            </Button>
          </div>
          {message && <InlineMessage kind={message.kind}>{message.text}</InlineMessage>}
        </form>
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <p className="text-sm text-foreground-muted">
            Löscht die Gruppe mit allen Spieltagen, Ergebnissen und Einladungen.
          </p>
          <Button
            type="button"
            variant="destructive"
            className="w-full sm:w-auto sm:self-end"
            onClick={() => setDeleteOpen(true)}
          >
            Gruppe löschen
          </Button>
        </div>
        <DeleteGroupDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} name={name} />
      </CardBody>
    </Card>
  );
}
