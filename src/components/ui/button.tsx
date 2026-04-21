"use client";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-background bg-[image:var(--cta-gradient)] shadow-[0_6px_14px_-4px_rgba(34,211,238,0.35)] hover:brightness-110",
  secondary:
    "bg-surface text-foreground border border-border-strong hover:bg-surface-muted",
  ghost:
    "bg-transparent text-foreground border border-border-strong hover:bg-surface-muted",
  destructive:
    "bg-destructive-soft text-destructive border border-destructive/40 hover:bg-destructive/20",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim()}
    >
      {loading ? "…" : children}
    </button>
  );
}
