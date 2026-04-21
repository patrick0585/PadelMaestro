import type { InputHTMLAttributes, LabelHTMLAttributes } from "react";

const INPUT_BASE =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${INPUT_BASE} ${className}`.trim()} />;
}

const LABEL_BASE = "mb-1 block text-sm font-medium text-foreground";

export function Label({ className = "", ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...rest} className={`${LABEL_BASE} ${className}`.trim()} />;
}
