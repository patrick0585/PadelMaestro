"use client";
import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string; loginHint?: boolean };

const GENERIC = "Unerwarteter Fehler. Bitte erneut versuchen.";
const ERRORS: Record<number, string> = {
  410: "Dieser Link ist nicht mehr gültig.",
  429: "Zu viele Versuche, bitte später.",
};
const LINK_CLASS =
  "flex min-h-11 items-center justify-center rounded-xl text-sm text-foreground-muted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const INLINE_LINK_CLASS =
  "font-semibold text-primary underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function SignupForm({ token, kind }: { token: string; kind: "founder" | "member" }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const loginHref = "/login?next=" + encodeURIComponent("/einladung/" + token);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accepted) return;
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, name: name.trim(), email: email.trim(), password, acceptTerms: true }),
      });
      if (res.status === 201) {
        const login = await signIn("credentials", { identifier: email.trim(), password, redirect: false });
        if (login?.error) window.location.assign(loginHref);
        else window.location.assign(kind === "founder" ? "/gruppe/neu" : "/");
        return;
      }
      if (res.status === 409) {
        setStatus({
          kind: "error",
          message: "Zu dieser Adresse gibt es schon ein Konto, bitte anmelden.",
          loginHint: true,
        });
        return;
      }
      setStatus({ kind: "error", message: ERRORS[res.status] ?? GENERIC });
    } catch {
      setStatus({ kind: "error", message: GENERIC });
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="signup-name">Name</Label>
          <Input
            id="signup-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="signup-email">E-Mail-Adresse</Label>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="signup-password">Passwort (min. 8 Zeichen)</Label>
          <Input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="flex min-h-11 items-start gap-3">
          <input
            id="signup-terms"
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            required
            className="mt-0.5 h-5 w-5 shrink-0 rounded accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
          <label htmlFor="signup-terms" className="text-sm text-foreground">
            Ich akzeptiere die{" "}
            <Link href="/nutzungsbedingungen" target="_blank" rel="noreferrer" className={INLINE_LINK_CLASS}>
              Nutzungsbedingungen
            </Link>{" "}
            und habe die{" "}
            <Link href="/datenschutz" target="_blank" rel="noreferrer" className={INLINE_LINK_CLASS}>
              Datenschutzerklärung
            </Link>{" "}
            gelesen
          </label>
        </div>
        {status.kind === "error" && (
          <InlineMessage kind="error">
            {status.loginHint ? (
              <Link href={loginHref} className="underline">
                {status.message}
              </Link>
            ) : (
              status.message
            )}
          </InlineMessage>
        )}
        <Button type="submit" loading={status.kind === "submitting"} className="w-full">
          Konto anlegen
        </Button>
      </form>
      <Link href={loginHref} className={LINK_CLASS}>
        Schon ein Konto? Anmelden
      </Link>
    </div>
  );
}
