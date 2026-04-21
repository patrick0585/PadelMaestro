import type { HTMLAttributes } from "react";

type Variant = "primary" | "neutral" | "success" | "destructive";

const BASE =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary-soft text-primary border border-primary-border",
  neutral: "bg-surface-muted text-muted-foreground",
  success: "bg-surface-muted text-success",
  destructive: "bg-surface-muted text-destructive",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ variant = "primary", className = "", ...rest }: BadgeProps) {
  return <span {...rest} className={`${BASE} ${VARIANTS[variant]} ${className}`.trim()} />;
}
