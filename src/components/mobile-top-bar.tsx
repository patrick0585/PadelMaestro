"use client";
import { UserMenu } from "./user-menu";

export function MobileTopBar({
  name,
  playerId,
  avatarVersion,
}: {
  name: string;
  playerId: string;
  avatarVersion: number;
}) {
  // The bar pads its top by env(safe-area-inset-top) so its content
  // (the avatar tap target) stays clear of the iOS Dynamic Island /
  // notch in standalone PWA mode (root layout uses viewportFit=cover).
  // Without this, the avatar sits under the notch in portrait and is
  // only reachable in landscape — same pattern as BottomTabs handling
  // safe-area-inset-bottom.
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/80 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden print:hidden">
      <div className="flex h-14 items-center justify-end px-4">
        <UserMenu playerId={playerId} name={name} avatarVersion={avatarVersion} />
      </div>
    </header>
  );
}
