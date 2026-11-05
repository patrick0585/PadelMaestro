import { sparkline } from "@/lib/home/sparkline";
import { LABEL } from "./styles";
const R = 38;
const STROKE = 8;
const C = 2 * Math.PI * R;

function Ring({ pct, children }: { pct: number; children: React.ReactNode }) {
  const size = 2 * (R + STROKE);
  return (
    <div className="relative grid size-[92px] shrink-0 place-items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={R + STROKE} cy={R + STROKE} r={R} fill="none" strokeWidth={STROKE} className="stroke-slate-400/20" />
        {pct > 0 && (
          <circle
            cx={R + STROKE}
            cy={R + STROKE}
            r={R}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            className="anim-ring stroke-lime"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - pct)}
            style={{ "--ring-c": C } as React.CSSProperties}
          />
        )}
      </svg>
      <div className="relative text-center font-display text-[28px] font-extrabold leading-none tabular-nums">{children}</div>
    </div>
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
  rank: number;
  rankedCount: number;
  attended: number;
  totalDays: number;
  jokersUsed: number;
  form: number[];
  muted?: boolean;
}

export function SeasonCard(p: SeasonCardProps) {
  const pct = p.matches > 0 ? p.wins / p.matches : 0;
  return (
    <section aria-label={p.seasonName} className={`${CARD} ${p.muted ? "" : GLOW}`}>
      <h2 className={`flex items-baseline justify-between gap-3 ${LABEL} text-[12px] tracking-[0.16em]`}>
        <span className="text-primary">{p.seasonName}</span>
        <span className="truncate">{p.groupName}</span>
      </h2>
      <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-3">
        <div>
          <p className="font-display text-[76px] font-extrabold leading-[0.85] tabular-nums text-white">{p.ppg.toFixed(2)}</p>
          <p className="mt-1.5 text-sm font-semibold text-slate-300">Punkte pro Spiel</p>
        </div>
        <Ring pct={pct}>
          {Math.round(pct * 100)}%
          <small className="mt-0.5 block font-sans text-[11px] font-medium text-foreground-muted">
            {p.wins} von {p.matches}
          </small>
        </Ring>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 tabular-nums">
        <div className="rounded-xl bg-background/55 px-2.5 pb-2 pt-1.5">
          <p className={LABEL}>Rang</p>
          <p className="font-display text-[22px] font-extrabold leading-tight">
            #{p.rank}
            <span className="ml-1 font-sans text-[13px] font-medium text-foreground-muted">von {p.rankedCount}</span>
          </p>
        </div>
        <div className="rounded-xl bg-background/55 px-2.5 pb-2 pt-1.5">
          <p className={LABEL}>Dabei</p>
          <p className="font-display text-[22px] font-extrabold leading-tight">
            {p.attended}/{p.totalDays}
            <span className="ml-1 font-sans text-[13px] font-medium text-foreground-muted">
              · {p.jokersUsed} Joker
            </span>
          </p>
        </div>
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
