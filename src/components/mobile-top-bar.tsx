"use client";
import { UserMenu } from "./user-menu";
import { GroupSwitcher } from "./group-switcher";

export function MobileTopBar({
  name,
  playerId,
  avatarVersion,
  groups,
  activeGroupId,
}: {
  name: string;
  playerId: string;
  avatarVersion: number;
  groups: { id: string; name: string }[];
  activeGroupId: string | null;
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
        <div className="flex min-w-0 flex-1 items-center">
          <GroupSwitcher groups={groups} activeGroupId={activeGroupId} />
        </div>
        <UserMenu playerId={playerId} name={name} avatarVersion={avatarVersion} />
      </div>
    </header>
  );
}
