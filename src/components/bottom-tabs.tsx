"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; icon: string };

const USER_TABS: Tab[] = [
  { href: "/ranking", label: "Rangliste", icon: "🏆" },
  { href: "/game-day", label: "Spieltag", icon: "🎾" },
];

const ADMIN_TAB: Tab = { href: "/admin", label: "Admin", icon: "⚙️" };

export function BottomTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = isAdmin ? [...USER_TABS, ADMIN_TAB] : USER_TABS;

  return (
    <nav
      aria-label="Hauptnavigation"
      className="sticky bottom-0 z-40 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
              active ? "text-primary font-semibold" : "text-muted-foreground"
            }`}
          >
            <span className="text-xl">{t.icon}</span>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
