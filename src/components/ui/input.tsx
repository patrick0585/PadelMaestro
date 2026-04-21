"use client";
import type { InputHTMLAttributes } from "react";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={`w-full rounded-xl border border-border-strong bg-surface-muted px-3 py-2 text-sm text-foreground placeholder:text-foreground-dim focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background ${className}`.trim()}
    />
  );
}

export function Label({ className = "", ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...rest} className={`text-sm font-medium text-foreground ${className}`.trim()} />;
}
