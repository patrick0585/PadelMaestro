import type { HTMLAttributes } from "react";

const BASE = "rounded-2xl bg-surface border border-border shadow-sm";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`${BASE} ${className}`.trim()} />;
}

export function CardHeader({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`px-5 pt-5 ${className}`.trim()} />;
}

export function CardBody({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`p-5 ${className}`.trim()} />;
}
