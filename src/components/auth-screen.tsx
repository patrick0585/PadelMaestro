import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { LegalFooter } from "@/components/legal-footer";

interface AuthScreenProps {
  /** Omitted when there is nowhere sensible to go back to. */
  backHref?: string;
  kicker?: string;
  title: ReactNode;
  subtitle?: string;
  /** Rendered inside the app shell, which already provides the main landmark and height. */
  embedded?: boolean;
  children: ReactNode;
}

export function AuthScreen({ backHref, kicker, title, subtitle, embedded = false, children }: AuthScreenProps) {
  const Column = embedded ? "div" : "main";
  return (
    <div className={embedded ? undefined : "min-h-dvh bg-background"}>
      <Column
        className={`mx-auto flex w-full max-w-[400px] flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] ${embedded ? "" : "min-h-dvh"}`}
      >
        {backHref && (
          <Link
            href={backHref}
            className="-ml-2 inline-flex min-h-11 w-fit items-center rounded-lg pr-3 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
            Zurück
          </Link>
        )}
        {kicker && (
          <p className="mt-4 font-display text-xs font-bold uppercase tracking-[0.18em] text-primary">{kicker}</p>
        )}
        <h1
          className={`${kicker ? "mt-2" : "mt-4"} font-display text-[34px] font-extrabold uppercase leading-[0.95] text-foreground`}
        >
          {title}
        </h1>
        {subtitle && <p className="mb-5 mt-1.5 text-sm text-foreground-muted">{subtitle}</p>}
        <div className={subtitle ? "" : "mt-5"}>{children}</div>
        <div className="mt-auto">
          <LegalFooter />
        </div>
      </Column>
    </div>
  );
}
