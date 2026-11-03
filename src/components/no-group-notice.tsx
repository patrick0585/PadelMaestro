import Link from "next/link";
import { Users } from "lucide-react";

export function NoGroupNotice({ canFound = false }: { canFound?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-10 text-center">
      <Users className="h-10 w-10 text-foreground-muted" aria-hidden="true" />
      <h1 className="text-lg font-semibold text-foreground">Du bist in keiner Gruppe</h1>
      <p className="text-sm text-foreground-muted">
        {canFound
          ? "Du kannst jetzt deine eigene Gruppe gründen."
          : "Bitte einen Admin um Aufnahme in eine Gruppe."}
      </p>
      <Link
        href={canFound ? "/gruppe/neu" : "/profil"}
        className="inline-flex h-11 items-center justify-center rounded-xl border border-border-strong bg-surface px-4 text-sm font-semibold text-foreground transition-all hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {canFound ? "Gruppe gründen" : "Zum Profil"}
      </Link>
    </div>
  );
}
