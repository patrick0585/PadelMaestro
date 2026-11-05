import Link from "next/link";
import type { ReactNode } from "react";
import { TICKET_HEAD, TICKET_PILL } from "@/components/home/styles";
import { countdownLabel, daysUntil } from "@/lib/home/countdown";

const DATE = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// Same vocabulary as the home ticket buttons (dashboard-hero.tsx).
export const TICKET_ACTION =
  "inline-flex min-h-11 items-center justify-center rounded-xl border text-[14.5px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50";
export const TICKET_ACTION_GO = `${TICKET_ACTION} border-lime bg-lime text-background`;
export const TICKET_ACTION_IDLE = `${TICKET_ACTION} border-white/50 bg-black/30 text-white hover:bg-black/40`;

export interface AttendanceCounts {
  confirmed: number;
  declined: number;
  joker: number;
  pending: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function attendanceCaption(c: AttendanceCounts): string {
  const parts = [plural(c.confirmed, "Zusage", "Zusagen"), `${c.pending} offen`, plural(c.declined, "Absage", "Absagen")];
  if (c.joker > 0) parts.push(`${c.joker} Joker`);
  return parts.join(" · ");
}

export function AttendanceBar({ counts, decorative = false }: { counts: AttendanceCounts; decorative?: boolean }) {
  const { confirmed, declined, joker, pending } = counts;
  const segments = [
    ...Array<string>(confirmed).fill("bg-lime"),
    ...Array<string>(joker).fill("bg-amber-300"),
    ...Array<string>(declined).fill("bg-rose-400"),
    ...Array<string>(pending).fill("bg-white/20"),
  ];
  const label = [`${confirmed} zugesagt`, `${declined} abgesagt`, ...(joker > 0 ? [`${joker} Joker`] : []), `${pending} offen`].join(", ");
  return (
    <div
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
      className="mt-2.5 flex gap-1"
    >
      {segments.map((cls, i) => (
        <span key={i} className={`h-2 max-w-6 flex-1 rounded-full ${cls}`} />
      ))}
    </div>
  );
}

export function AdminTicket({
  label,
  date,
  startTime = null,
  pill,
  children,
  footer,
}: {
  label: string;
  date: Date | null;
  startTime?: string | null;
  pill?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section aria-label={label} className="ticket">
      <div className={TICKET_HEAD}>
        <span>{label}</span>
        {pill && <span className={TICKET_PILL}>{pill}</span>}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="font-display text-[34px] font-extrabold leading-none text-white">
          {date ? DATE.format(date) : "Kein Spieltag geplant"}
        </p>
        {startTime && (
          <p className="text-right">
            <span className="block font-display text-xs font-bold uppercase tracking-[0.14em] text-white/90">Anpfiff</span>
            <span className="font-display text-2xl font-extrabold tabular-nums text-white">{startTime}</span>
          </p>
        )}
      </div>
      {children}
      {footer && (
        <>
          <div className="ticket-perf" aria-hidden="true" />
          {footer}
        </>
      )}
    </section>
  );
}

export function countdownPill(date: Date, now = new Date()): string {
  return countdownLabel(daysUntil(date, now));
}

export function TicketLink({ href, go = false, children }: { href: string; go?: boolean; children: ReactNode }) {
  return (
    <Link href={href} className={go ? TICKET_ACTION_GO : TICKET_ACTION_IDLE}>
      {children}
    </Link>
  );
}
