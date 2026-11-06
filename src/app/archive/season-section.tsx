import Link from "next/link";
import { DateBlock } from "@/components/date-block";
import { MEDAL, TICKET_HEAD, TICKET_PILL } from "@/components/home/styles";
import type { ArchivedGameDayRow } from "@/lib/archive/list";
import { winnerLineOf } from "@/lib/archive/format";
import { dateBlockOf } from "@/lib/format-date";
import type { RankingRow } from "@/lib/ranking/compute";
import { FOCUS_INSET } from "@/components/ui/focus";

export interface SeasonSectionData {
  seasonId: string;
  seasonName: string;
  seasonIsActive: boolean;
  rows: ArchivedGameDayRow[];
}

function SelfChip({ self }: { self: ArchivedGameDayRow["self"] }) {
  if (!self) return <span className="text-xs text-foreground-muted">nicht dabei</span>;
  const gold = self.rank === 1;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums ${
        gold ? "bg-amber-300/15 text-amber-300" : "bg-primary-soft text-primary"
      }`}
    >
      <span aria-hidden="true">Du: {self.rank}.</span>
      <span className="sr-only">, du: Platz {self.rank}</span>
    </span>
  );
}

export function DayRow({ row }: { row: ArchivedGameDayRow }) {
  const winner = winnerLineOf(row.podium);
  return (
    <li>
      <Link
        href={`/archive/${row.id}`}
        className={`grid min-h-14 grid-cols-[44px_1fr_auto_12px] items-center gap-3 px-3.5 py-2.5 ${FOCUS_INSET}`}
      >
        <DateBlock date={row.date} size="lg" srPrefix="Spieltag " />
        <span className="min-w-0">
          {winner ? (
            <span className="flex min-w-0 items-baseline gap-1.5 text-[15px] font-semibold">
              <span role="img" aria-label="Tagessieg" className="shrink-0">
                {MEDAL[1]}
              </span>
              <span className="min-w-0 truncate">{winner.names}</span>
              <span className="shrink-0 font-display text-[17px] font-bold tabular-nums text-lime">
                {winner.points}
                <span className="sr-only"> Punkte</span>
              </span>
            </span>
          ) : (
            <span className="block text-[15px] font-semibold text-foreground-muted">Kein Ergebnis</span>
          )}
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground-muted">
            <span className="min-w-0 truncate">
              {row.matchCount} {row.matchCount === 1 ? "Match" : "Matches"} · {row.playerCount} Spieler
            </span>
            {row.jokerCount > 0 && (
              <span
                data-testid="joker-badge"
                className="shrink-0 rounded-full border border-amber-300/40 px-1.5 text-[11px] font-semibold text-amber-200"
              >
                <span aria-hidden="true">Joker {row.jokerCount}</span>
                <span className="sr-only">, {row.jokerCount} Joker eingesetzt</span>
              </span>
            )}
          </span>
        </span>
        <SelfChip self={row.self} />
        <span aria-hidden="true" className="text-lg text-foreground-dim">
          ›
        </span>
      </Link>
    </li>
  );
}

export function ChampionTicket({ seasonName, ranking }: { seasonName: string; ranking: RankingRow[] }) {
  const champions = ranking.filter((r) => r.rank === 1);
  if (champions.length === 0) return null;
  const runnersUp = ranking.filter((r) => r.rank === 2 || r.rank === 3);
  return (
    <section aria-label={`Endstand ${seasonName}`} className="ticket">
      <div className={TICKET_HEAD}>
        <span>Meister · {seasonName}</span>
        <span className={TICKET_PILL}>Endstand</span>
      </div>
      <div className="mt-2.5 flex items-center gap-3">
        <span className="text-[34px] leading-none" aria-hidden="true">
          🏆
        </span>
        <div className="min-w-0">
          <p className={`line-clamp-2 font-display font-extrabold leading-none text-white ${champions.length > 1 ? "text-2xl" : "text-[30px]"}`}>
            {champions.map((c) => c.playerName).join(" · ")}
          </p>
          <p className="mt-1 text-[13px] tabular-nums text-[#d9f6fb]">
            {champions[0].points.toFixed(0)} Punkte · Ø {champions[0].pointsPerGame.toFixed(2)}
          </p>
        </div>
      </div>
      {runnersUp.length > 0 && (
        <>
          <div className="ticket-perf" />
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] tabular-nums text-[#e2f8ff]">
            {runnersUp.map((r) => (
              <li key={r.playerId}>
                <span role="img" aria-label={`Platz ${r.rank}`}>
                  {MEDAL[r.rank]}
                </span>{" "}
                {r.playerName} {r.points.toFixed(0)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function SeasonSection({ section, ranking }: { section: SeasonSectionData; ranking: RankingRow[] | null }) {
  const count = section.rows.length;
  const latest = section.rows[0];
  const latestWinner = latest ? winnerLineOf(latest.podium) : null;
  const latestDate = latest ? dateBlockOf(latest.date) : null;
  const headingId = `season-${section.seasonId}`;
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <h2 id={headingId} className="font-display text-xl font-extrabold">
          {section.seasonName}
        </h2>
        {section.seasonIsActive ? (
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11.5px] font-semibold text-primary">laufend</span>
        ) : (
          <span className="text-xs text-foreground-muted">abgeschlossen</span>
        )}
      </div>
      {ranking && <ChampionTicket seasonName={section.seasonName} ranking={ranking} />}
      <details className="group overflow-hidden rounded-[18px] border border-border bg-surface">
        <summary className={`flex min-h-12 cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden justify-between gap-3 px-3.5 py-2.5 ${FOCUS_INSET}`}>
          <span className="min-w-0">
            <b className="block text-[14.5px]">
              {count} {count === 1 ? "Spieltag" : "Spieltage"}
            </b>
            {section.seasonIsActive && latestWinner && latestDate && (
              <span className="block truncate text-xs text-foreground-muted">
                Zuletzt {latestDate.day}. {latestDate.month} ·{" "}
                <span role="img" aria-label="Tagessieg">
                  {MEDAL[1]}
                </span>{" "}
                {latestWinner.names}
              </span>
            )}
          </span>
          <span aria-hidden="true" className="text-primary transition-transform group-open:rotate-90 motion-reduce:transition-none">
            ›
          </span>
        </summary>
        <ul className="divide-y divide-border border-t border-border">
          {section.rows.map((row) => (
            <DayRow key={row.id} row={row} />
          ))}
        </ul>
      </details>
    </section>
  );
}
