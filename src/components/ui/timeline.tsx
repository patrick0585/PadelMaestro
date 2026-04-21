import type { HTMLAttributes } from "react";

export type TimelineStepStatus = "done" | "current" | "upcoming";

export interface TimelineStep {
  id: string;
  label: string;
  status: TimelineStepStatus;
}

const STATUS_LABEL: Record<TimelineStepStatus, string> = {
  done: "erledigt",
  current: "aktuell",
  upcoming: "kommend",
};

const DOT_CLASS: Record<TimelineStepStatus, string> = {
  done: "bg-primary border-primary",
  current: "bg-primary border-primary shadow-[0_0_0_4px_rgba(34,211,238,0.25)]",
  upcoming: "bg-surface-muted border-border-strong",
};

const LABEL_CLASS: Record<TimelineStepStatus, string> = {
  done: "text-primary",
  current: "text-primary",
  upcoming: "text-foreground-dim",
};

export interface TimelineProps extends HTMLAttributes<HTMLOListElement> {
  steps: TimelineStep[];
}

export function Timeline({ steps, className = "", ...rest }: TimelineProps) {
  return (
    <ol
      {...rest}
      className={`flex items-start gap-1 ${className}`.trim()}
      aria-label="Fortschritt"
    >
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const nextDone = !isLast && steps[index + 1]!.status !== "upcoming";
        return (
          <li
            key={step.id}
            className="flex flex-1 items-start"
            aria-current={step.status === "current" ? "step" : undefined}
            aria-label={`Schritt ${index + 1} von ${steps.length}, ${step.label}, ${STATUS_LABEL[step.status]}`}
          >
            <div className="flex flex-1 flex-col items-center gap-1">
              <span
                className={`h-3 w-3 rounded-full border-2 ${DOT_CLASS[step.status]}`}
                aria-hidden="true"
              />
              <span
                className={`text-[0.65rem] font-semibold uppercase tracking-wider ${LABEL_CLASS[step.status]}`}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <span
                aria-hidden="true"
                className={`mt-[5px] h-[2px] w-4 ${nextDone ? "bg-primary" : "bg-border-strong"}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
