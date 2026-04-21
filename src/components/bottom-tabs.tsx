"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Trophy, CircleDot, Settings } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

type Tab = { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> };

const USER_TABS: Tab[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/ranking", label: "Rangliste", icon: Trophy },
  { href: "/game-day", label: "Spieltag", icon: CircleDot },
];

const ADMIN_TAB: Tab = { href: "/admin", label: "Admin", icon: Settings };

export function BottomTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = isAdmin ? [...USER_TABS, ADMIN_TAB] : USER_TABS;

  return (
    <nav
      aria-label="Hauptnavigation"
      className="sticky bottom-0 z-40 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {tabs.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.68rem] font-semibold transition-colors ${
              active ? "text-primary" : "text-foreground-muted"
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
