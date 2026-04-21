"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "./user-menu";

type Item = { href: string; label: string };

const USER_ITEMS: Item[] = [
  { href: "/ranking", label: "Rangliste" },
  { href: "/game-day", label: "Spieltag" },
];

const ADMIN_ITEM: Item = { href: "/admin", label: "Admin" };

export function TopNav({ isAdmin, name }: { isAdmin: boolean; name: string }) {
  const pathname = usePathname();
  const items = isAdmin ? [...USER_ITEMS, ADMIN_ITEM] : USER_ITEMS;

  return (
    <header className="hidden md:block sticky top-0 z-40 border-b border-border bg-surface">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
        <Link href="/ranking" className="text-lg font-bold text-foreground">
          Padel Tracker
        </Link>
        <nav aria-label="Hauptnavigation" className="flex items-center gap-4">
          {items.map((i) => {
            const active = pathname === i.href;
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`text-sm ${
                  active ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
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
