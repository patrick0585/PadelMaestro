"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export function AvatarUploader({
  playerId,
  name,
  avatarVersion,
}: {
  playerId: string;
  name: string;
  avatarVersion: number;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!f) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setStatus({ kind: "error", message: "Datei ist größer als 5 MB." });
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setStatus({ kind: "idle" });
  }

  async function onUpload() {
    if (!file) return;
    setStatus({ kind: "submitting" });
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/profile/avatar", { method: "POST", body });
    if (res.ok) {
      setStatus({ kind: "success" });
      setFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
      return;
    }
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    if (errBody.error === "file_too_large") {
      setStatus({ kind: "error", message: "Datei ist größer als 5 MB." });
    } else if (errBody.error === "invalid_image") {
      setStatus({ kind: "error", message: "Kein gültiges Bild." });
    } else {
      setStatus({ kind: "error", message: "Hochladen fehlgeschlagen." });
    }
  }

  async function onRemove() {
    setStatus({ kind: "submitting" });
    const res = await fetch("/api/profile/avatar", { method: "DELETE" });
    if (res.ok) {
      setStatus({ kind: "success" });
      router.refresh();
      return;
    }
    setStatus({ kind: "error", message: "Entfernen fehlgeschlagen." });
  }

  const submitting = status.kind === "submitting";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt="Vorschau"
            width={96}
            height={96}
            unoptimized
            className="h-24 w-24 shrink-0 rounded-full object-cover"
          />
        ) : (
          <Avatar playerId={playerId} name={name} avatarVersion={avatarVersion} size={96} />
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onPick}
          className="text-sm text-foreground-muted file:mr-3 file:rounded-xl file:border file:border-border-strong file:bg-surface-muted file:px-3 file:py-2 file:text-sm file:text-foreground"
        />
      </div>
      {status.kind === "error" && (
        <p
          role="alert"
          className="rounded-xl bg-destructive-soft/40 px-3 py-2 text-sm text-destructive"
        >
          {status.message}
        </p>
      )}
      {status.kind === "success" && (
        <p
          role="status"
          className="rounded-xl bg-success-soft/40 px-3 py-2 text-sm text-success"
        >
          Gespeichert.
        </p>
      )}
      <div className="flex justify-end gap-2">
        {avatarVersion > 0 && !file && (
          <Button variant="ghost" onClick={onRemove} disabled={submitting}>
            Entfernen
          </Button>
        )}
        <Button onClick={onUpload} disabled={!file} loading={submitting}>
          Speichern
        </Button>
      </div>
    </div>
  );
}
