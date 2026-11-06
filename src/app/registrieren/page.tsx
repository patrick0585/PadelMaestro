import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { publicSignupEnabled } from "@/lib/flags";
import { appleConfigured } from "@/lib/auth/apple/config";
import { withNext } from "@/lib/auth/next-path";
import { AuthScreen } from "@/components/auth-screen";
import { SignupForm } from "@/app/einladung/[token]/signup-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Konto erstellen – Padelmaestro" };

const LINK =
  "inline-flex min-h-11 items-center rounded-xl text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const session = await auth();
  if (session?.user?.id) redirect("/");
  const open = publicSignupEnabled();
  const rawNext = (await searchParams).next;
  const next = typeof rawNext === "string" ? rawNext : undefined;

  return (
    <AuthScreen
      backHref={withNext("/login", next)}
      title={
        <>
          Konto <br />
          erstellen
        </>
      }
      subtitle={open ? "Kostenlos. Für deine Padel-Runde." : "Registrierung im Moment nur mit Einladung."}
    >
      {open ? (
        <SignupForm kind="open" appleEnabled={appleConfigured()} flat />
      ) : (
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-5 text-sm text-foreground-muted">
          <p>Öffne den Einladungslink, den du von deiner Gruppe bekommen hast. Du willst eine eigene Runde starten? Schreib uns über die Hilfe-Seite.</p>
          <Link href="/support" className={LINK}>
            Zur Hilfe-Seite
          </Link>
        </div>
      )}
    </AuthScreen>
  );
}
