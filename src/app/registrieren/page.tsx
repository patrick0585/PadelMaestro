import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { publicSignupEnabled } from "@/lib/flags";
import { PadelLogo } from "@/components/padel-logo";
import { LegalFooter } from "@/components/legal-footer";
import { SignupForm } from "@/app/einladung/[token]/signup-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Konto erstellen – Padelmaestro" };

const LINK =
  "inline-flex min-h-11 items-center rounded-xl text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/");
  const open = publicSignupEnabled();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <PadelLogo className="mx-auto mb-3 h-16 w-16" />
          <h1 className="text-2xl font-extrabold text-foreground">Konto erstellen</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {open ? "Kostenlos. Gründe deine Runde oder tritt per Einladung bei." : "Registrierung im Moment nur mit Einladung."}
          </p>
        </div>
        {open ? (
          <SignupForm kind="open" />
        ) : (
          <div className="space-y-3 rounded-2xl border border-border bg-surface p-5 text-sm text-foreground-muted">
            <p>Öffne den Einladungslink, den du von deiner Gruppe bekommen hast. Du willst eine eigene Runde starten? Schreib uns über die Hilfe-Seite.</p>
            <Link href="/support" className={LINK}>
              Zur Hilfe-Seite
            </Link>
          </div>
        )}
        <Link href="/login" className={`${LINK} mt-3 w-full justify-center`}>
          Schon ein Konto? Anmelden
        </Link>
        <LegalFooter />
      </div>
    </div>
  );
}
