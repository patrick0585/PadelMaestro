"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { isStaleDeploymentError, reloadOnceForStaleDeployment } from "@/lib/stale-deployment";

const BTN =
  "flex min-h-12 w-full items-center justify-center rounded-2xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleDeploymentError(error);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    console.error(error);
    if (stale && reloadOnceForStaleDeployment()) setReloading(true);
  }, [error, stale]);

  if (reloading) {
    return (
      <div role="status" className="mx-auto max-w-md py-16 text-center text-foreground-muted">
        Es gibt eine neue Version der App. Einen Moment, sie wird geladen …
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 py-12">
      <p className="font-display text-[12px] font-bold uppercase tracking-[0.16em] text-primary">Fehler</p>
      <h1 className="font-display text-[30px] font-extrabold uppercase leading-none">Da ist etwas schiefgelaufen</h1>
      <p className="text-sm text-foreground-muted">
        Die Seite konnte nicht angezeigt werden. Meist hilft es, sie neu zu laden.
        {error.digest && <span className="mt-1 block text-xs">Code: {error.digest}</span>}
      </p>
      <button type="button" onClick={reset} className={`${BTN} bg-lime text-background`}>
        Erneut versuchen
      </button>
      <button type="button" onClick={() => window.location.reload()} className={`${BTN} border border-border bg-surface`}>
        Neu laden
      </button>
      <Link href="/" className={`${BTN} text-primary`}>
        Zur Startseite
      </Link>
    </div>
  );
}
