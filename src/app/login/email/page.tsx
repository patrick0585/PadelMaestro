import Link from "next/link";
import { AuthScreen } from "@/components/auth-screen";
import { publicSignupEnabled } from "@/lib/flags";
import { withNext } from "@/lib/auth/next-path";
import { LoginForm } from "../login-form";

export const metadata = { title: "Anmelden – Padelmaestro" };

export default async function EmailLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = typeof rawNext === "string" ? rawNext : undefined;
  return (
    <AuthScreen
      backHref={withNext("/login", next)}
      title={
        <>
          Willkommen <br />
          zurück
        </>
      }
      subtitle="Mit E-Mail oder Benutzername."
    >
      <LoginForm next={next} />
      {publicSignupEnabled() && (
        <Link
          href={withNext("/registrieren", next)}
          className="mt-4 flex min-h-11 items-center justify-center rounded-xl text-[13px] text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span>
            Neu hier? <b className="font-semibold text-primary">Konto erstellen</b>
          </span>
        </Link>
      )}
    </AuthScreen>
  );
}
