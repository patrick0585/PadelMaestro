"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) setError("Falsche E-Mail oder Passwort");
    else router.push("/ranking");
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-sm space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Login</h1>
      <label className="block">
        <span className="text-sm">E-Mail</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-sm">Passwort</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? "..." : "Anmelden"}
      </button>
    </form>
  );
}
