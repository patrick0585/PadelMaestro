import Link from "next/link";
import type { ReactNode } from "react";

export function LargeTitle({
  title,
  back,
  action,
}: {
  title: string;
  back?: { href: string; label: string };
  action?: ReactNode;
}) {
  return (
    <header className="mb-3">
      {back && (
        <Link
          href={back.href}
          className="mb-1 inline-flex min-h-11 items-center gap-1 rounded text-[15px] text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span aria-hidden="true">‹</span>
          {back.label}
        </Link>
      )}
      <div className="flex items-center justify-between gap-3">
        <h1 className="mx-0.5 mt-1.5 font-display text-[34px] font-extrabold leading-tight">{title}</h1>
        {action}
      </div>
    </header>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mx-3.5 mb-1.5 mt-4 text-xs font-normal uppercase tracking-[0.04em] text-foreground-muted">
      {children}
    </h2>
  );
}

export function SectionFooter({ children }: { children: ReactNode }) {
  return (
    <p className="mx-3.5 mt-1.5 text-[11.5px] leading-[1.35] text-foreground-muted">{children}</p>
  );
}

export function GroupedList({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-[14px] bg-[#141f36] ${className}`.trim()}>
      {children}
    </div>
  );
}

export interface ListRowProps {
  href?: string;
  onClick?: () => void;
  icon?: { node: ReactNode; color: string };
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  /** Platz des Chevrons freihalten, damit Werte mit Nachbarzeilen fluchten */
  reserveChevron?: boolean;
  truncateValue?: boolean;
  tone?: "default" | "primary" | "destructive";
  align?: "start" | "center";
  testId?: string;
}

const TONES = {
  default: "text-foreground",
  primary: "text-primary",
  destructive: "text-destructive",
} as const;

export function ListRow({
  href,
  onClick,
  icon,
  leading,
  title,
  subtitle,
  value,
  trailing,
  chevron = false,
  reserveChevron = false,
  truncateValue = false,
  tone = "default",
  align = "start",
  testId,
}: ListRowProps) {
  // Trennlinie rückt bis zum Text ein; mit Icon/Leading weiter als ohne
  const inset = icon || leading ? "not-first:before:left-[52px]" : "not-first:before:left-3.5";
  const interactive = href || onClick;
  const className = [
    interactive
      ? "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      : "",
    "relative flex min-h-11 w-full items-center gap-[11px] px-3 py-2.5 text-left text-[14.5px]",
    "not-first:before:absolute not-first:before:right-0 not-first:before:top-0",
    "not-first:before:h-px not-first:before:bg-border not-first:before:content-['']",
    inset,
    TONES[tone],
    align === "center" ? "justify-center" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {icon && (
        <span
          aria-hidden="true"
          className="grid size-[30px] flex-none place-items-center rounded-lg text-[15px] text-white"
          style={{ backgroundColor: icon.color }}
        >
          {icon.node}
        </span>
      )}
      {leading}
      <span className={align === "center" ? "min-w-0" : "min-w-0 flex-1"}>
        <span className="block truncate">{title}</span>
        {subtitle && (
          <span className="mt-px block text-xs text-foreground-muted">{subtitle}</span>
        )}
      </span>
      {value != null && (
        <span
          className={`${truncateValue ? "min-w-0 truncate" : "shrink-0"} text-[13.5px] text-foreground-muted`}
        >
          {value}
        </span>
      )}
      {trailing}
      {(chevron || reserveChevron) && (
        <span
          aria-hidden="true"
          className={`ml-0.5 shrink-0 text-[17px] text-foreground-dim ${chevron ? "" : "invisible"}`.trim()}
        >
          ›
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} data-testid={testId}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} data-testid={testId}>
        {content}
      </button>
    );
  }
  return (
    <div className={className} data-testid={testId}>
      {content}
    </div>
  );
}

export function PrimaryAction({
  href,
  onClick,
  children,
  testId,
  type = "button",
  disabled,
}: {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  testId?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const className =
    "block min-h-11 w-full rounded-xl bg-primary p-[11px] text-center text-[14.5px] font-bold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";
  if (href) {
    return (
      <Link href={href} className={className} data-testid={testId}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={className}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
