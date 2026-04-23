export type RosterAttendance = "pending" | "confirmed" | "declined" | "joker";

export interface RosterParticipant {
  playerId: string;
  name: string;
  attendance: RosterAttendance;
}

type Tone = "lime" | "primary" | "soft" | "warning";

const TONE_CLASSES: Record<Tone, string> = {
  lime: "bg-success-soft text-success border border-success/40",
  primary: "bg-primary-soft text-primary border border-primary/30",
  soft: "bg-surface-muted text-foreground-muted",
  warning: "bg-warning/15 text-warning border border-warning/40",
};

export function RosterChips({
  participants,
}: {
  participants: RosterParticipant[];
}) {
  const confirmed = participants.filter((p) => p.attendance === "confirmed");
  const pending = participants.filter((p) => p.attendance === "pending");
  const declined = participants.filter((p) => p.attendance === "declined");
  const joker = participants.filter((p) => p.attendance === "joker");

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
      <ChipRow title="Dabei" count={confirmed.length} names={confirmed.map((p) => p.name)} tone="lime" />
      <ChipRow title="Offen" count={pending.length} names={pending.map((p) => p.name)} tone="primary" />
      <ChipRow title="Abgesagt" count={declined.length} names={declined.map((p) => p.name)} tone="soft" />
      {joker.length > 0 && (
        <ChipRow title="Joker" count={joker.length} names={joker.map((p) => p.name)} tone="warning" />
      )}
    </div>
  );
}

function ChipRow({
  title,
  count,
  names,
  tone,
}: {
  title: string;
  count: number;
  names: string[];
  tone: Tone;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
        {title} · {count}
      </div>
      {names.length === 0 ? (
        <div className="text-xs text-foreground-dim">—</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {names.map((n) => (
            <span
              key={n}
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]}`}
            >
              {n}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
