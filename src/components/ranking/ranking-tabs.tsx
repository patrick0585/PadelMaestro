import Link from "next/link";
import { FOCUS_INSET } from "@/components/ui/focus";

const RANKING_VIEWS = ["tabelle", "verlauf", "duos"] as const;
type RankingView = (typeof RANKING_VIEWS)[number];

const TITLE: Record<RankingView, string> = { tabelle: "Tabelle", verlauf: "Verlauf", duos: "Duos" };

export function parseRankingView(value: string | string[] | undefined): RankingView {
  return RANKING_VIEWS.find((v) => v === value) ?? "tabelle";
}

export function RankingTabs({ active }: { active: RankingView }) {
  return (
    <nav aria-label="Ansicht" className="grid grid-cols-3 rounded-xl border border-border bg-surface p-[3px]">
      {RANKING_VIEWS.map((v) => {
        const on = v === active;
        return (
          <Link
            key={v}
            href={v === "tabelle" ? "/ranking" : `/ranking?ansicht=${v}`}
            aria-current={on ? "page" : undefined}
            replace
            scroll={false}
            className={`flex min-h-11 items-center justify-center rounded-[9px] font-display text-[14px] font-bold uppercase tracking-[0.08em] ${FOCUS_INSET} ${
              on ? "bg-surface-elevated text-foreground shadow-[inset_0_-2px_0_var(--primary)]" : "text-foreground-muted"
            }`}
          >
            {TITLE[v]}
          </Link>
        );
      })}
    </nav>
  );
}
