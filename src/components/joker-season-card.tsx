export interface JokerSeasonCardProps {
  seasonName: string;
  jokers: { total: number; used: number; remaining: number };
}

export function JokerSeasonCard({ seasonName, jokers }: JokerSeasonCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
          Joker {seasonName}
        </span>
        <span className="text-[0.7rem] font-semibold text-foreground-muted">
          {jokers.used} / {jokers.total} eingesetzt
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {Array.from({ length: jokers.total }, (_, i) => {
          const used = i < jokers.used;
          return (
            <span
              key={i}
              aria-label={used ? "Joker eingesetzt" : "Joker verfügbar"}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold ${
                used
                  ? "border border-border bg-surface-muted text-foreground-muted"
                  : "bg-primary-soft text-primary-strong"
              }`}
            >
              ★
            </span>
          );
        })}
      </div>
      <div className="mt-2 text-sm font-semibold text-foreground">
        {jokers.remaining === 0
          ? "Keine Joker mehr verfügbar"
          : jokers.remaining === 1
            ? "1 Joker verfügbar"
            : `${jokers.remaining} Joker verfügbar`}
      </div>
    </div>
  );
}
