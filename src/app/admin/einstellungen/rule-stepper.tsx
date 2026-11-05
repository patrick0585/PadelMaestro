"use client";

export function RuleStepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
}) {
  const btn =
    "grid size-11 place-items-center rounded-lg text-lg font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <span role="group" aria-label={label} className="-my-2 -mr-2 inline-flex items-center">
      <button
        type="button"
        aria-label={`${label} verringern`}
        disabled={value - step < min}
        onClick={() => onChange(value - step)}
        className={btn}
      >
        −
      </button>
      <output aria-live="polite" className="min-w-6 text-center text-[15px] font-semibold tabular-nums">
        {value}
      </output>
      <button
        type="button"
        aria-label={`${label} erhöhen`}
        disabled={value + step > max}
        onClick={() => onChange(value + step)}
        className={btn}
      >
        +
      </button>
    </span>
  );
}
