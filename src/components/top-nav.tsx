"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "./user-menu";

type Item = { href: string; label: string };

const USER_ITEMS: Item[] = [
  { href: "/", label: "Home" },
  { href: "/ranking", label: "Rangliste" },
  { href: "/game-day", label: "Spieltag" },
  { href: "/archive", label: "Archiv" },
];

const ADMIN_ITEM: Item = { href: "/admin", label: "Admin" };

export function TopNav({ isAdmin, name }: { isAdmin: boolean; name: string }) {
  const pathname = usePathname();
  const items = isAdmin ? [...USER_ITEMS, ADMIN_ITEM] : USER_ITEMS;

  return (
    <header className="hidden md:block sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-foreground">
          Padel Tracker
        </Link>
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
          <UserMenu name={name} />
        </nav>
      </div>
    </header>
  );
}
