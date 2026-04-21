"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) {
      setLoading(false);
      setError("Falsche E-Mail oder Passwort");
      return;
    }
    window.location.assign("/ranking");
  }

  return (
    <Card className="w-full max-w-sm">
      <CardBody>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-2xl text-white">
            🎾
          </div>
          <h1 className="text-xl font-bold text-foreground">Padel Tracker</h1>
          <p className="text-sm text-muted-foreground">Melde dich an, um weiterzumachen</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">E-Mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
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
            <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" loading={loading} className="w-full">
            Anmelden
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
