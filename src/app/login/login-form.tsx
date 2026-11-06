"use client";
import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { safeNextPath } from "@/lib/auth/next-path";

export function LoginForm({ next }: { next?: string }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { identifier, password, redirect: false });
    if (res?.error) {
      setLoading(false);
      setError(res.code === "rate_limited" ? "Zu viele Anmeldeversuche. Bitte warte eine Minute." : "Falsche Anmeldedaten");
      return;
    }
    try {
      window.sessionStorage.removeItem("email-notice-dismissed");
    } catch {
      // storage blocked: the notice just stays dismissed
    }
    window.location.assign(safeNextPath(next));
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-surface p-5 space-y-3">
      <div>
        <Label htmlFor="identifier">E-Mail oder Benutzername</Label>
        <Input
          id="identifier"
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          autoComplete="username"
        />
      </div>
      <div>
        <Label htmlFor="password">Passwort</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" loading={loading} className="w-full">
        Anmelden
      </Button>
      <Link
        href="/passwort-vergessen"
        className="flex min-h-11 items-center justify-center rounded-xl text-sm text-foreground-muted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Passwort vergessen?
      </Link>
    </form>
  );
}
