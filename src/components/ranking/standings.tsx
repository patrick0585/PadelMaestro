import { Avatar } from "@/components/ui/avatar";
import { FormBars } from "@/components/home/form-bars";
import { MEDAL } from "@/components/home/styles";
import { gapText, type Gap } from "@/lib/ranking/standing";
import { Movement } from "./movement";
import { splitPodium } from "@/lib/game-day/day-podium";

export interface StandingRow {
  playerId: string;
  name: string;
  avatarVersion: number;
  rank: number;
  points: number;
  ppg: number;
  games: number;
  jokersUsed: number;
  medals: { gold: number; silver: number; bronze: number };
  movement: number | null;
  form: (number | null)[];
  isMe: boolean;
}


function medalLine(m: StandingRow["medals"]): string {
  return [
    m.gold && `${MEDAL[1]}${m.gold}`,
    m.silver && `${MEDAL[2]}${m.silver}`,
    m.bronze && `${MEDAL[3]}${m.bronze}`,
  ]
    .filter(Boolean)
    .join(" ");
}

// Tall enough for two stacked names on a shared step, so the 2-1-3 heights hold.
const STEP_HEIGHT = { 1: "min-h-[244px]", 2: "min-h-[220px]", 3: "min-h-[204px]" } as const;
// DOM order stays 1-2-3 for screen readers; the grid shows 2-1-3.
const STEP_COL = { 1: "col-start-2 row-start-1", 2: "col-start-1 row-start-1", 3: "col-start-3 row-start-1" } as const;

function PodiumStep({ players, place }: { players: StandingRow[]; place: 1 | 2 | 3 }) {
  const first = place === 1;
  const tied = players.length > 1;
  const mine = players.some((p) => p.isMe);
  const lead = players[0];
  return (
    <li
      aria-current={mine ? "true" : undefined}
      className={`flex min-w-0 flex-col justify-end rounded-t-2xl rounded-b-md border px-1.5 pb-2.5 pt-3 text-center ${STEP_HEIGHT[place]} ${STEP_COL[place]} ${
        first
          ? "border-amber-400/35 bg-[radial-gradient(90%_70%_at_50%_0%,rgba(251,191,36,0.22),transparent_70%),linear-gradient(#1a2440,var(--surface))]"
          : "border-border bg-[linear-gradient(#1a2440,var(--surface))]"
      } ${mine ? "ring-2 ring-primary" : ""}`}
    >
      <span className="mb-1.5 flex items-center justify-center gap-1">
        <span className="text-[22px] leading-none" role="img" aria-label={tied ? `Geteilter Platz ${place}` : `Platz ${place}`}>
          {MEDAL[place]}
        </span>
        {!tied && <Movement value={lead.movement} />}
      </span>
      <span className="flex justify-center -space-x-2">
        {players.slice(0, 2).map((p) => (
          <Avatar
            key={p.playerId}
            playerId={p.playerId}
            name={p.name}
            avatarVersion={p.avatarVersion}
            size={first && !tied ? 48 : 40}
            className="ring-2 ring-surface"
          />
        ))}
      </span>
      <p className="mt-1.5 text-sm font-semibold leading-tight">
        {players.map((p) => (
          <span key={p.playerId} className="block truncate">
            {p.name.split(" ")[0]}
          </span>
        ))}
        {mine && <span className="sr-only"> (Du)</span>}
      </p>
      <p className={`font-display font-extrabold leading-none tabular-nums ${first ? "mt-1 text-[38px] text-amber-300" : "mt-1 text-[30px]"}`}>
        {lead.points.toFixed(0)}
        <span className="sr-only"> Punkte</span>
      </p>
      <p className="mt-0.5 text-[11.5px] tabular-nums text-foreground-muted">{tied ? "geteilt" : `Ø ${lead.ppg.toFixed(2)}`}</p>
    </li>
  );
}

export function Standings({ rows, myGap }: { rows: StandingRow[]; myGap: Gap | null }) {
  const { steps, rest } = splitPodium(rows);
  const podium = steps.flatMap((st) => st.players);
  return (
    <>
      <ol aria-label="Podium" className="grid grid-cols-[1fr_1.15fr_1fr] items-end gap-2">
        {steps.map((st) => (
          <PodiumStep key={st.rank} players={st.players} place={st.rank as 1 | 2 | 3} />
        ))}
      </ol>
      {myGap && podium.some((r) => r.isMe) && (
        <p className="-mt-1.5 text-center text-[13px] font-semibold text-primary">Du: {gapText(myGap)}</p>
      )}
      {rest.length > 0 && (
        <ol aria-label="Weitere Plätze" className="overflow-hidden rounded-[18px] border border-border bg-surface">
          {rest.map((r, i) => {
            const medals = medalLine(r.medals);
            return (
              <li
                key={r.playerId}
                aria-current={r.isMe ? "true" : undefined}
                className={`grid grid-cols-[24px_32px_1fr_auto_minmax(2.5rem,auto)_auto] items-center gap-2.5 px-3.5 py-2.5 ${i > 0 ? "border-t border-border" : ""} ${r.isMe ? "bg-[linear-gradient(90deg,rgba(34,211,238,0.16),transparent)] shadow-[inset_3px_0_0_var(--primary)]" : ""}`}
              >
                <span className={`text-center font-display text-[22px] font-extrabold tabular-nums ${r.isMe ? "text-lime" : "text-foreground-muted"}`}>
                  {r.rank}
                </span>
                <Avatar playerId={r.playerId} name={r.name} avatarVersion={r.avatarVersion} size={32} />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">
                    {r.name}
                    {r.isMe && <span className="sr-only"> (Du)</span>}
                  </p>
                  <p className="truncate text-xs text-foreground-muted">
                    Ø {r.ppg.toFixed(2)} · {r.games} Sp{r.jokersUsed > 0 ? ` · ${r.jokersUsed} J` : ""}
                  </p>
                  {medals && <p className="text-xs text-foreground-muted">{medals}</p>}
                  {r.isMe && myGap && <p className="text-[11.5px] font-semibold text-primary">{gapText(myGap)}</p>}
                </div>
                <FormBars values={r.form} me={r.isMe} />
                <span className="text-right font-display text-[24px] font-extrabold tabular-nums">
                  {r.points.toFixed(0)}
                  <span className="sr-only"> Punkte</span>
                </span>
                <Movement value={r.movement} />
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
