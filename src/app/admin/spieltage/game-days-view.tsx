"use client";
import { useState } from "react";
import { CloseSeasonDialog } from "../close-season-dialog";
import { CreateGameDayForm } from "../create-game-day-form";
import { GroupedList, LargeTitle, ListRow, SectionFooter, SectionLabel } from "@/components/ui/list";
import type { OpenGameDay, RecentGameDay } from "@/lib/admin/game-days";
import { withStartTime } from "@/lib/game-day/start-time";
import { formatGameDayDateLong } from "@/lib/format-date";
import { DateBlock } from "@/components/date-block";

function Pill({ running }: { running: boolean }) {
  const tone = running
    ? "bg-primary-soft text-primary"
    : "bg-surface-muted text-foreground-muted";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {running ? "Läuft" : "Geplant"}
    </span>
  );
}

export function GameDaysView({
  open,
  recent,
  seasonName,
  maxJokers,
}: {
  open: OpenGameDay[];
  recent: RecentGameDay[];
  seasonName: string;
  maxJokers: number;
}) {
  const [closeOpen, setCloseOpen] = useState(false);
  return (
    <div className="mx-auto max-w-2xl">
      <LargeTitle title="Spieltage" back={{ href: "/admin", label: "Verwaltung" }} />
      <CreateGameDayForm />

      {open.length > 0 && (
        <>
          <SectionLabel>Offen</SectionLabel>
          <GroupedList>
            {open.map((d) => {
              const running = d.status === "in_progress";
              return (
                <ListRow
                  key={d.id}
                  href={running ? "/game-day" : `/admin/spieltage/${d.id}`}
                  title={withStartTime(formatGameDayDateLong(d.date), d.startTime)}
                  subtitle={`${d.confirmed} / ${d.total} zugesagt`}
                  trailing={<Pill running={running} />}
                  chevron
                />
              );
            })}
          </GroupedList>
          <SectionFooter>Zusagen verwalten, Aufstellung prüfen und starten im Detail.</SectionFooter>
        </>
      )}

      <SectionLabel>Zuletzt gespielt</SectionLabel>
      {recent.length === 0 ? (
        <GroupedList>
          <ListRow title="Noch keine Spieltage gespielt" />
        </GroupedList>
      ) : (
        <GroupedList>
          {recent.map((d) => (
            <ListRow
              key={d.id}
              href={`/archive/${d.id}`}
              leading={<DateBlock date={d.date} size="md" />}
              title={
                d.winners.length > 0 ? (
                  <>
                    <span role="img" aria-label="Tagessieg">
                      🥇
                    </span>{" "}
                    {d.winners.join(" · ")}{" "}
                    {d.winnerPoints !== null && (
                      <span className="font-display text-[17px] font-bold tabular-nums text-lime">
                        {d.winnerPoints}
                        <span className="sr-only"> Punkte</span>
                      </span>
                    )}
                  </>
                ) : (
                  "Kein Ergebnis"
                )
              }
              subtitle={`${d.playerCount} Spieler`}
              chevron
            />
          ))}
        </GroupedList>
      )}

      <SectionLabel>Saison</SectionLabel>
      <GroupedList>
        <ListRow onClick={() => setCloseOpen(true)} title="Saison abschließen…" tone="destructive" />
      </GroupedList>
      <CloseSeasonDialog
        currentName={seasonName}
        maxJokers={maxJokers}
        open={closeOpen}
        onOpenChange={setCloseOpen}
      />
    </div>
  );
}
