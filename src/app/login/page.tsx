import { LoginForm } from "./login-form";
import { PadelLogo } from "@/components/padel-logo";
import Link from "next/link";
import { LegalFooter } from "@/components/legal-footer";
import { publicSignupEnabled } from "@/lib/flags";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <PadelLogo className="mx-auto mb-3 h-16 w-16" />
          <h1 className="text-2xl font-extrabold text-foreground">Willkommen zurück</h1>
          <p className="mt-1 text-sm text-foreground-muted">Bitte melde dich an.</p>
        </div>
        <LoginForm next={typeof next === "string" ? next : undefined} />
        {publicSignupEnabled() && (
          <Link
            href="/registrieren"
            className="mt-4 flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface text-sm font-semibold text-foreground hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Neu hier? Konto erstellen
          </Link>
        )}
        <LegalFooter />
      </div>
    </div>
  );
}
