"use client";
import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";

export function AvatarDialog({
  open,
  onClose,
  playerId,
  playerName,
  avatarVersion,
}: {
  open: boolean;
  onClose: () => void;
  playerId: string | null;
  playerName: string | null;
  avatarVersion: number;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setError(null);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [open]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!f) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("Datei ist größer als 5 MB.");
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setError(null);
  }

  async function onUpload() {
    if (!file || !playerId) return;
    setLoading(true);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`/api/players/${playerId}/avatar`, { method: "PUT", body });
    setLoading(false);
    if (!res.ok) {
      setError("Hochladen fehlgeschlagen.");
      return;
    }
    onClose();
    router.refresh();
  }

  async function onRemove() {
    if (!playerId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/players/${playerId}/avatar`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      setError("Entfernen fehlgeschlagen.");
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Avatar — ${playerName ?? ""}`}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Vorschau"
              className="h-24 w-24 shrink-0 rounded-full object-cover"
            />
          ) : playerId ? (
            <Avatar
              playerId={playerId}
              name={playerName ?? ""}
              avatarVersion={avatarVersion}
              size={96}
            />
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onPick}
            className="text-sm text-foreground-muted file:mr-3 file:rounded-xl file:border file:border-border-strong file:bg-surface-muted file:px-3 file:py-2 file:text-sm file:text-foreground"
          />
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          {avatarVersion > 0 && !file && (
            <Button variant="ghost" onClick={onRemove} disabled={loading}>
              Entfernen
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Abbrechen
          </Button>
          <Button onClick={onUpload} disabled={!file} loading={loading}>
            Speichern
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
