import type { HTMLAttributes } from "react";

type Variant = "primary" | "neutral" | "success" | "destructive" | "soft" | "lime" | "warning";

const BASE =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary-soft text-primary border border-primary/30",
  neutral: "bg-surface-muted text-foreground-muted border border-border",
  success: "bg-success-soft text-success border border-success/40",
  destructive: "bg-destructive-soft text-destructive border border-destructive/40",
  soft: "bg-surface-muted text-foreground-muted",
  lime: "bg-success-soft text-success border border-success/40",
  warning: "bg-warning/15 text-warning border border-warning/40",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ variant = "primary", className = "", ...rest }: BadgeProps) {
  return <span {...rest} className={`${BASE} ${VARIANTS[variant]} ${className}`.trim()} />;
}
