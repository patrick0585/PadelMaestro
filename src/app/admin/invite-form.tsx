"use client";
import { useState } from "react";

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUrl(null);
    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Fehler");
      return;
    }
    setUrl(body.url);
    setEmail("");
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="neue@email.de"
          required
          className="flex-1 rounded border px-3 py-2"
        />
        <button className="rounded bg-black px-4 py-2 text-white">Einladen</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {url && (
        <p className="break-all rounded bg-muted p-2 text-xs">
          Einladungslink: <code>{url}</code>
        </p>
      )}
    </form>
  );
}
