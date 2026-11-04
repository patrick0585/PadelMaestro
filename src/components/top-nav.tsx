"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "./user-menu";
import { PadelLogo } from "./padel-logo";
import { GroupSwitcher } from "./group-switcher";

type Item = { href: string; label: string };

const USER_ITEMS: Item[] = [
  { href: "/", label: "Home" },
  { href: "/ranking", label: "Rangliste" },
  { href: "/game-day", label: "Spieltag" },
  { href: "/archive", label: "Archiv" },
];

const ADMIN_ITEM: Item = { href: "/admin", label: "Verwaltung" };

export function TopNav({
  isAdmin,
  name,
  playerId,
  avatarVersion,
  groups,
  activeGroupId,
}: {
  isAdmin: boolean;
  name: string;
  playerId: string;
  avatarVersion: number;
  groups: { id: string; name: string }[];
  activeGroupId: string | null;
}) {
  const pathname = usePathname();
  const items = isAdmin ? [...USER_ITEMS, ADMIN_ITEM] : USER_ITEMS;

  return (
    <header className="hidden md:block sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 text-lg font-extrabold tracking-tight text-foreground"
          >
            <PadelLogo className="h-7 w-7" />
            Padelmaestro
          </Link>
          {groups.length > 0 && <span aria-hidden className="h-5 w-px bg-border" />}
          <GroupSwitcher groups={groups} activeGroupId={activeGroupId} />
        </div>
        <nav aria-label="Hauptnavigation" className="flex items-center gap-5">
          {items.map((i) => {
            const active = i.href === "/" ? pathname === "/" : pathname.startsWith(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`text-sm font-semibold transition-colors ${
                  active ? "text-primary" : "text-foreground-muted hover:text-foreground"
                }`}
              >
                {i.label}
              </Link>
            );
          })}
          <UserMenu playerId={playerId} name={name} avatarVersion={avatarVersion} />
        </nav>
      </div>
    </header>
  );
}
