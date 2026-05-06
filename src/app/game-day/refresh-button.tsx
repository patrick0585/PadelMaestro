"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

// Mobile/PWA users reported the page not refreshing while they were
// inside the app — SSE live-updates run only during in_progress and
// drop on iOS background. This button is the explicit, always-on
// escape hatch: tap → router.refresh() re-runs the RSC tree, and the
// "vor Xs"-label gives visible reassurance that something happened.
function formatAge(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 5) return "gerade eben";
  if (seconds < 60) return `vor ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `vor ${minutes}min`;
}

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  // Tick every 15s so the label keeps pace with reality without
  // burning the renderer. 15s is small enough to feel responsive
  // ("vor 30s" appears within one tick) and large enough not to
  // matter on battery-constrained devices.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  function handleClick() {
    startTransition(() => {
      router.refresh();
      setLastRefreshedAt(Date.now());
      setNow(Date.now());
    });
  }

  const ageLabel = formatAge(now - lastRefreshedAt);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label="Spieltag aktualisieren"
      aria-busy={pending}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground-muted transition-colors hover:text-foreground disabled:opacity-60"
    >
      <RotateCw
        className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      <span>{pending ? "Lädt…" : ageLabel}</span>
    </button>
  );
}

export { formatAge as _formatAgeForTesting };
