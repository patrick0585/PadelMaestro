import type { HTMLAttributes } from "react";

type Variant = "default" | "hero" | "inset";

const VARIANTS: Record<Variant, string> = {
  default: "rounded-2xl bg-surface border border-border shadow-[0_2px_8px_-4px_rgba(0,0,0,0.5)]",
  hero: "rounded-2xl border border-primary/50 bg-[image:var(--hero-gradient)] shadow-[0_14px_30px_-12px_rgba(0,0,0,0.6)]",
  inset: "rounded-xl bg-surface-muted border border-border",
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
}

export function Card({ variant = "default", className = "", ...rest }: CardProps) {
  return <div {...rest} className={`${VARIANTS[variant]} ${className}`.trim()} />;
}

export function CardHeader({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`px-5 pt-5 ${className}`.trim()} />;
}

export function CardBody({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`p-5 ${className}`.trim()} />;
}
