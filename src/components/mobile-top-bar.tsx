"use client";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import type { LiveStripData } from "@/lib/game-day/live-strip";
import { PadelLogo } from "./padel-logo";
import { GroupSwitcher } from "./group-switcher";
import { LiveStrip } from "./live-strip";

export function MobileTopBar({
  name,
  playerId,
  avatarVersion,
  groups,
  activeGroupId,
  live = null,
}: {
  name: string;
  playerId: string;
  avatarVersion: number;
  groups: { id: string; name: string }[];
  activeGroupId: string | null;
  live?: LiveStripData | null;
}) {
  // The bar pads its top by env(safe-area-inset-top) so its content
  // (the avatar tap target) stays clear of the iOS Dynamic Island /
  // notch in standalone PWA mode (root layout uses viewportFit=cover).
  // Without this, the avatar sits under the notch in portrait and is
  // only reachable in landscape — same pattern as BottomTabs handling
  // safe-area-inset-bottom.
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/80 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden print:hidden">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Link href="/" aria-label="Home" className="-ml-2 grid size-11 shrink-0 place-items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            <PadelLogo className="size-7" />
          </Link>
          <GroupSwitcher groups={groups} activeGroupId={activeGroupId} />
        </div>
        <Link
          href="/profil"
          aria-label="Profil"
          className="-mr-0.5 grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Avatar playerId={playerId} name={name} avatarVersion={avatarVersion} size={40} />
        </Link>
      </div>
      <LiveStrip live={live} />
    </header>
  );
}
