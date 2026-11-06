import { Avatar } from "@/components/ui/avatar";
import { LABEL, MEDAL } from "@/components/home/styles";
import { computeGameDaySummary } from "@/lib/game-day/summary";
import { rankingModeFor } from "@/lib/game-day/competition-rank";
import { splitPodium } from "@/lib/game-day/day-podium";
import { listJokersForGameDay } from "@/lib/joker/list";
import { JokerBlock } from "./joker-block";
import { mergeJokersIntoRows, type DisplayRow } from "./joker-summary-merge";
import { PartnershipCounts } from "./partnership-counts";
import { ShareResultButton } from "./share-result-button";

const STEP = {
  1: { col: "col-start-2 row-start-1", height: "min-h-[236px]", pts: "text-[38px] text-amber-300", avatar: 48 as const },
  2: { col: "col-start-1 row-start-1", height: "min-h-[212px]", pts: "text-[30px]", avatar: 40 as const },
  3: { col: "col-start-3 row-start-1", height: "min-h-[196px]", pts: "text-[30px]", avatar: 40 as const },
} as const;

function JokerTag() {
  return (
    <span className="ml-1.5 rounded-full border border-amber-300/40 px-1.5 text-[11px] font-semibold text-amber-200">Joker</span>
  );
}

function PodiumStep({ rank, players, meId }: { rank: 1 | 2 | 3; players: DisplayRow[]; meId: string | null }) {
  const st = STEP[rank];
  const mine = players.some((p) => p.playerId === meId);
  const tied = players.length > 1;
  return (
    <li
      aria-current={mine ? "true" : undefined}
      className={`flex min-w-0 flex-col justify-end rounded-t-2xl rounded-b-md border px-1.5 pb-2.5 pt-3 text-center ${st.col} ${st.height} ${
        rank === 1
          ? "border-amber-400/35 bg-[radial-gradient(90%_70%_at_50%_0%,rgba(251,191,36,0.22),transparent_70%),linear-gradient(#1a2440,var(--surface))]"
          : "border-border bg-[linear-gradient(#1a2440,var(--surface))]"
      } ${mine ? "ring-2 ring-primary" : ""}`}
    >
      <span className="mb-1.5 text-[22px] leading-none" role="img" aria-label={tied ? `Geteilter Platz ${rank}` : `Platz ${rank}`}>
        {MEDAL[rank]}
      </span>
      <span className="flex justify-center -space-x-2">
        {players.slice(0, 2).map((p) => (
          <Avatar key={p.playerId} playerId={p.playerId} name={p.playerName} avatarVersion={p.avatarVersion} size={tied ? 40 : st.avatar} className="ring-2 ring-surface" />
        ))}
      </span>
      <p className="mt-1.5 text-sm font-semibold leading-tight">
        {players.map((p) => (
          <span key={p.playerId} className="block truncate">
            {p.playerName.split(" ")[0]}
            {p.jokerUsed && <JokerTag />}
          </span>
        ))}
      </p>
      <p className={`mt-1 font-display font-extrabold leading-none tabular-nums ${st.pts}`}>
        {players[0].points}
        <span className="sr-only"> Punkte</span>
      </p>
      <p className="mt-0.5 text-[11.5px] text-foreground-muted">
        {tied ? "geteilt" : `${players[0].matches} ${players[0].matches === 1 ? "Match" : "Matches"}`}
      </p>
    </li>
  );
}

export function DayStandings({
  rows,
  meId,
  scoredMatchCount,
  totalMatchCount,
}: {
  rows: DisplayRow[];
  meId: string | null;
  scoredMatchCount: number;
  totalMatchCount: number;
}) {
  const { steps, rest } = splitPodium(rows);
  return (
    <>
      <p className={`px-1 ${LABEL}`}>
        Tagesranking · {scoredMatchCount} / {totalMatchCount} gewertet
      </p>
      <ol aria-label="Podium" className="grid grid-cols-[1fr_1.15fr_1fr] items-end gap-2">
        {steps.map((s) => (
          <PodiumStep key={s.rank} rank={s.rank as 1 | 2 | 3} players={s.players} meId={meId} />
        ))}
      </ol>
      {rest.length > 0 && (
        <ol aria-label="Weitere Plätze" className="divide-y divide-border overflow-hidden rounded-[18px] border border-border bg-surface">
          {rest.map((row) => {
            const mine = row.playerId === meId;
            return (
              <li
                key={row.playerId}
                aria-current={mine ? "true" : undefined}
                className={`grid grid-cols-[24px_32px_1fr_auto_40px] items-center gap-2.5 px-3 py-2.5 text-sm ${
                  mine ? "bg-[linear-gradient(90deg,rgba(34,211,238,0.14),transparent)] shadow-[inset_3px_0_0_var(--primary)]" : ""
                }`}
              >
                <span className="text-center font-display text-xl font-extrabold tabular-nums text-foreground-muted">{row.rank}</span>
                <Avatar playerId={row.playerId} name={row.playerName} avatarVersion={row.avatarVersion} size={32} />
                <span className="min-w-0 truncate font-semibold">
                  {row.playerName}
                  {row.jokerUsed && <JokerTag />}
                </span>
                <span className="text-xs text-foreground-muted">
                  {row.matches} {row.matches === 1 ? "Match" : "Matches"}
                </span>
                <span className="text-right font-display text-[22px] font-extrabold tabular-nums">
                  {row.points}
                  <span className="sr-only"> Punkte</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

export async function FinishedSummary({
  gameDayId,
  scoredMatchCount,
  totalMatchCount,
  meId = null,
}: {
  gameDayId: string;
  scoredMatchCount: number;
  totalMatchCount: number;
  meId?: string | null;
}) {
  const [summary, jokers] = await Promise.all([
    computeGameDaySummary(gameDayId),
    listJokersForGameDay(gameDayId),
  ]);

  const displayRows = summary ? mergeJokersIntoRows(summary.rows, jokers, rankingModeFor(summary.date)) : [];
  if (!summary || displayRows.length === 0) {
    return (
      <>
        <p className="rounded-[18px] border border-dashed border-border p-4 text-sm text-foreground-muted">
          Spieltag beendet · {scoredMatchCount} / {totalMatchCount} Matches gewertet
        </p>
        <JokerBlock jokers={jokers} />
      </>
    );
  }

  return (
    <>
      <DayStandings rows={displayRows} meId={meId} scoredMatchCount={scoredMatchCount} totalMatchCount={totalMatchCount} />
      {summary.status === "finished" && (
        <ShareResultButton gameDayId={gameDayId} fileName={`padelmaestro-${summary.date.toISOString().slice(0, 10)}.png`} />
      )}
      <PartnershipCounts gameDayId={gameDayId} />
    </>
  );
}
