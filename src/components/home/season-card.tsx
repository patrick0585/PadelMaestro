import Link from "next/link";
import { sparkline } from "@/lib/home/sparkline";
import { LABEL } from "./styles";
const R = 38;
const STROKE = 8;
const C = 2 * Math.PI * R;

function Ring({
  pct,
  stroke = "stroke-lime",
  size = "size-[92px]",
  children,
}: {
  pct: number;
  stroke?: string;
  size?: string;
  children: React.ReactNode;
}) {
  const box = 2 * (R + STROKE);
  return (
    <div className={`relative grid ${size} shrink-0 place-items-center`}>
      <svg viewBox={`0 0 ${box} ${box}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={R + STROKE} cy={R + STROKE} r={R} fill="none" strokeWidth={STROKE} className="stroke-slate-400/20" />
        {pct > 0 && (
          <circle
            cx={R + STROKE}
            cy={R + STROKE}
            r={R}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            className={`anim-ring ${stroke}`}
            strokeDasharray={C}
            strokeDashoffset={C * (1 - Math.min(1, pct))}
            style={{ "--ring-c": C } as React.CSSProperties}
          />
        )}
      </svg>
      <div className="relative text-center font-display text-[28px] font-extrabold leading-none tabular-nums">{children}</div>
    </div>
  );
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

function StatRing({
  href,
  label,
  pct,
  stroke,
  value,
  caption,
}: {
  href: string;
  label: string;
  pct: number;
  stroke: string;
  value: string;
  caption: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex min-h-11 flex-col items-center gap-1.5 rounded-[14px] bg-background/55 px-1 pb-2 pt-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Ring pct={pct} stroke={stroke} size="size-[64px]">
        <span className="text-[16px]">{value}</span>
      </Ring>
      <span aria-hidden="true" className="text-center text-[11.5px] leading-tight text-foreground-muted">
        {caption} <span className="text-primary">›</span>
      </span>
    </Link>
  );
}

const BOX = { width: 330, height: 64, padX: 16, padTop: 22, padBottom: 12 };

function Form({ values }: { values: number[] }) {
  const s = sparkline(values, BOX);
  const label = `Form der letzten ${values.length} Spieltage: ${values.map((v) => v.toFixed(1)).join(", ")}`;
  return (
    <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} className="mt-1.5 block h-16 w-full overflow-visible" role="img" aria-label={label}>
      <defs>
        <linearGradient id="season-form-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--success)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--success)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {s.points.length > 1 && (
        <>
          <path d={s.area} fill="url(#season-form-fill)" />
          <path
            d={s.line}
            fill="none"
            strokeWidth={2.5}
            strokeLinecap="round"
            pathLength={1}
            className="anim-draw stroke-lime"
            style={{ "--len": 1 } as React.CSSProperties}
          />
        </>
      )}
      {s.points.map((p, i) => {
        const last = i === s.points.length - 1;
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={last ? 5 : 3.5} strokeWidth={2} className={last ? "fill-lime stroke-lime" : "fill-background stroke-lime"} />
            <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={12} fontWeight={600} className={last ? "fill-white" : "fill-slate-300"}>
              {p.value.toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const CARD =
  "relative overflow-hidden rounded-[18px] border border-[#26334f] bg-[linear-gradient(160deg,#16213b,var(--surface))] px-3.5 pb-2.5 pt-3.5";
const GLOW = "bg-[radial-gradient(70%_90%_at_100%_0%,rgba(190,242,100,0.10),transparent_65%),linear-gradient(160deg,#16213b,var(--surface))]";

export interface SeasonCardProps {
  seasonName: string;
  groupName: string;
  ppg: number;
  wins: number;
  matches: number;
  attended: number;
  totalDays: number;
  jokersUsed: number;
  jokersTotal: number;
  form: number[];
  muted?: boolean;
}

export function SeasonCard(p: SeasonCardProps) {
  const winPct = ratio(p.wins, p.matches);
  return (
    <section aria-label={p.seasonName} className={`${CARD} ${p.muted ? "" : GLOW}`}>
      <h2 className={`flex items-baseline justify-between gap-3 ${LABEL} text-[12px] tracking-[0.16em]`}>
        <span className="text-primary">{p.seasonName}</span>
        <span className="truncate">{p.groupName}</span>
      </h2>
      <p className="mt-2 flex items-baseline gap-2.5">
        <span className="font-display text-[64px] font-extrabold leading-[0.85] tabular-nums text-white">{p.ppg.toFixed(2)}</span>
        <span className={LABEL}>Punkte pro Match</span>
      </p>
      <div className={`mt-3 grid gap-2 ${p.jokersTotal > 0 ? "grid-cols-3" : "grid-cols-2"}`}>
        <StatRing
          href="/ranking?ansicht=duos"
          label={`${Math.round(winPct * 100)} Prozent: ${p.wins} von ${p.matches} Partien gewonnen, zu deinen Duos`}
          pct={winPct}
          stroke="stroke-lime"
          value={`${Math.round(winPct * 100)}%`}
          caption={
            <>
              <b className="text-foreground">{p.wins}</b> von {p.matches}
              <br />
              gewonnen
            </>
          }
        />
        <StatRing
          href="/archive"
          label={`${p.attended} von ${p.totalDays} Spieltagen dabei, zum Archiv`}
          pct={ratio(p.attended, p.totalDays)}
          stroke="stroke-primary"
          value={`${p.attended}/${p.totalDays}`}
          caption={
            <>
              Spieltage
              <br />
              dabei
            </>
          }
        />
        {p.jokersTotal > 0 && (
          <StatRing
            href="/game-day"
            label={`${p.jokersUsed} von ${p.jokersTotal} Jokern gesetzt, zum Spieltag`}
            pct={ratio(p.jokersUsed, p.jokersTotal)}
            stroke="stroke-amber-400"
            value={`${p.jokersUsed}/${p.jokersTotal}`}
            caption={
              <>
                Joker
                <br />
                gesetzt
              </>
            }
          />
        )}
      </div>
      {p.form.length > 0 && (
        <>
          <Form values={p.form} />
          <p className={`mt-2 flex justify-between ${LABEL}`}>
            <span>Form · letzte {p.form.length === 1 ? "Spieltag" : `${p.form.length} Spieltage`}</span>
            {p.form.length > 1 && <span aria-hidden="true">letzter →</span>}
          </p>
        </>
      )}
    </section>
  );
}

export function SeasonCardEmpty({ seasonName, jokersRemaining }: { seasonName: string; jokersRemaining: number }) {
  return (
    <section aria-label={seasonName} className={`${CARD} ${GLOW}`}>
      <h2 className={`flex items-baseline justify-between ${LABEL} text-[12px] tracking-[0.16em]`}>
        <span className="text-primary">{seasonName}</span>
        <span>Neu dabei</span>
      </h2>
      <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-3">
        <div>
          <p className="font-display text-[24px] font-extrabold uppercase leading-[1.1]">Dein erster Spieltag zählt</p>
          <p className="mt-1.5 text-sm leading-snug text-foreground-muted">
            Nach dem ersten Spieltag erscheinen hier Rang, PPG, Gewinnquote und deine Form. Bis dahin: zusagen und mitspielen.
          </p>
        </div>
        <Ring pct={0}>
          {jokersRemaining}
          <small className="mt-0.5 block font-sans text-[11px] font-medium text-foreground-muted">Joker</small>
        </Ring>
      </div>
      <div className="mt-3 flex gap-2" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <i key={i} className="h-2.5 flex-1 rounded-full bg-slate-400/15" />
        ))}
      </div>
      <p className={`mt-2 ${LABEL}`}>Deine Form füllt sich Spieltag für Spieltag</p>
    </section>
  );
}
