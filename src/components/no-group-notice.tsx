import Link from "next/link";
import { Mail, Users } from "lucide-react";

const BTN =
  "inline-flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function NoGroupNotice({ canFound = false }: { canFound?: boolean }) {
  if (!canFound) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-10 text-center">
        <Users className="h-10 w-10 text-foreground-muted" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-foreground">Du bist in keiner Gruppe</h1>
        <p className="text-sm text-foreground-muted">Bitte einen Admin um Aufnahme in eine Gruppe.</p>
        <Link href="/profil" className={`${BTN} border border-border-strong bg-surface text-foreground hover:bg-surface-muted`}>
          Zum Profil
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <header className="pt-2">
        <h1 className="font-display text-[30px] font-extrabold uppercase leading-none">Willkommen</h1>
        <p className="mt-1 text-sm text-foreground-muted">Du bist noch in keiner Gruppe. Wie möchtest du loslegen?</p>
      </header>
      <section className="space-y-3 rounded-2xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Users aria-hidden="true" className="size-5 text-lime" /> Eigene Runde gründen
        </h2>
        <p className="text-sm text-foreground-muted">Du organisierst die Spieltage und lädst deine Mitspieler ein.</p>
        <Link href="/gruppe/neu" className={`${BTN} bg-lime text-background`}>
          Gruppe gründen
        </Link>
      </section>
      <section className="space-y-2 rounded-2xl border border-dashed border-border p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Mail aria-hidden="true" className="size-5 text-primary" /> Ich wurde eingeladen
        </h2>
        <p className="text-sm text-foreground-muted">
          Öffne den Einladungslink, den dir der Admin deiner Gruppe geschickt hat. Du landest dann direkt in der Gruppe.
        </p>
      </section>
    </div>
  );
}
