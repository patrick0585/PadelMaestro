"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { LiveStripData } from "@/lib/game-day/live-strip";

const POLL_MS = 30_000;

async function fetchLive(): Promise<LiveStripData | null | undefined> {
  try {
    const res = await fetch("/api/game-day/live", { cache: "no-store" });
    if (!res.ok) return undefined;
    return ((await res.json()) as { live: LiveStripData | null }).live;
  } catch {
    return undefined; // offline: keep the last known state
  }
}

/** Green strip under the header while a game day runs; one tap to the court. Hidden on /game-day itself. */
export function LiveStrip({ live }: { live: LiveStripData | null }) {
  const pathname = usePathname();
  const [data, setData] = useState(live);
  useEffect(() => setData(live), [live]);

  // The root layout survives client navigation, so the server value goes stale: re-check on
  // every page change, on return to the app and every 30 s while visible.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      const next = await fetchLive();
      if (!cancelled && next !== undefined) setData(next);
    };
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [pathname]);

  if (!data || pathname === "/game-day" || pathname.startsWith("/game-day/")) return null;
  const progress = data.current === null ? `Alle ${data.total} Matches gewertet` : `Match ${data.current} von ${data.total}`;
  return (
    <Link
      href="/game-day"
      aria-label={`Spieltag läuft, ${progress}, zum Court`}
      className="flex min-h-11 items-center justify-between gap-3 border-b border-lime/30 bg-[linear-gradient(90deg,#365314,#1a2e05)] px-4 text-[13px] text-lime-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lime"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-lime shadow-[0_0_0_3px_rgba(190,242,100,0.25)]" />
        <span className="shrink-0 font-display text-[13px] font-bold uppercase tracking-[0.1em] text-lime">Spieltag läuft</span>
        <span className="truncate">· {progress}</span>
      </span>
      <span aria-hidden="true" className="flex shrink-0 items-center font-semibold">
        Zum Court <ChevronRight className="size-4" />
      </span>
    </Link>
  );
}
