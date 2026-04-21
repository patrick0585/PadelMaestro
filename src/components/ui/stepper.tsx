"use client";

export interface StepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
  label?: string;
}

export function Stepper({ value, min = 0, max = 9, onChange, label }: StepperProps) {
  const canDec = value > min;
  const canInc = value < max;
  return (
    <div className="inline-flex items-center gap-1.5" role="group" aria-label={label ?? "Wert"}>
      <button
        type="button"
        aria-label="Wert verringern"
        disabled={!canDec}
        onClick={() => canDec && onChange(value - 1)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border-strong bg-surface-muted text-base font-bold text-foreground transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
      >
        −
      </button>
      <span
        role="status"
        aria-live="polite"
        className="min-w-[38px] rounded-md border border-primary bg-surface-muted px-2 py-0.5 text-center text-base font-extrabold tabular-nums text-primary"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="Wert erhöhen"
        disabled={!canInc}
        onClick={() => canInc && onChange(value + 1)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border-strong bg-surface-muted text-base font-bold text-foreground transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
