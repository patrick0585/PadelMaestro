import Link from "next/link";
import { PadelLogo } from "@/components/padel-logo";

export default function TermsPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <PadelLogo className="mx-auto mb-3 h-16 w-16" />
          <h1 className="text-2xl font-extrabold text-foreground">Nutzungsbedingungen</h1>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
          <p className="text-sm text-foreground">Der Text wird vor dem Beta-Start ergänzt.</p>
          <Link
            href="/login"
            className="flex min-h-11 items-center justify-center rounded-xl text-sm text-foreground-muted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Zurück
          </Link>
        </div>
      </div>
    </div>
  );
}
