"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/invitations/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Fehler beim Speichern");
      return;
    }
    router.push("/login");
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-sm space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Konto einrichten</h1>
      <label className="block">
        <span className="text-sm">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-sm">Passwort (min. 10 Zeichen)</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={10}
          autoComplete="new-password"
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="w-full rounded bg-black px-4 py-2 text-white">
        Konto erstellen
      </button>
    </form>
  );
}
