"use client";
import { useState } from "react";
import { CloseSeasonDialog } from "../close-season-dialog";
import { GroupedList, LargeTitle, ListRow, SectionFooter, SectionLabel } from "@/components/ui/list";

function formatDate(date: Date): string {
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function SeasonView({
  name,
  startDate,
  finishedCount,
  maxJokers,
}: {
  name: string;
  startDate: Date;
  finishedCount: number;
  maxJokers: number;
}) {
  const [closeOpen, setCloseOpen] = useState(false);
  return (
    <div className="mx-auto max-w-2xl">
      <LargeTitle title="Saison" back={{ href: "/admin", label: "Verwaltung" }} />

      <SectionLabel>Aktuelle Saison</SectionLabel>
      <GroupedList>
        <ListRow title="Name" value={name} />
        <ListRow title="Seit" value={formatDate(startDate)} />
        <ListRow title="Gespielte Spieltage" value={String(finishedCount)} />
        <ListRow title="Joker pro Saison" value={String(maxJokers)} />
      </GroupedList>

      <SectionLabel>Abschluss</SectionLabel>
      <GroupedList>
        <ListRow onClick={() => setCloseOpen(true)} title="Saison abschließen…" tone="destructive" align="center" />
      </GroupedList>
      <SectionFooter>Beendet die Saison und startet eine neue. Die Ergebnisse bleiben im Archiv.</SectionFooter>
      <CloseSeasonDialog
        currentName={name}
        maxJokers={maxJokers}
        open={closeOpen}
        onOpenChange={setCloseOpen}
      />
    </div>
  );
}
