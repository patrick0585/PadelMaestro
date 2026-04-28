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
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-end border-b border-border bg-surface/80 px-4 backdrop-blur md:hidden print:hidden">
      <UserMenu playerId={playerId} name={name} avatarVersion={avatarVersion} />
    </header>
  );
}
