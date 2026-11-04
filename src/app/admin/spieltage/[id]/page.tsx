import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { loadPlannedGameDay } from "@/lib/admin/game-days";
import { LargeTitle, SectionLabel } from "@/components/ui/list";
import { ParticipantsRoster } from "../../participants-roster";
import { StartGameDayButton } from "../../start-game-day-button";
import { DeleteGameDayButton } from "../../delete-game-day-button";

export const dynamic = "force-dynamic";

export default async function AdminGameDayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAdmin();
  const result = await loadPlannedGameDay(ctx.groupId, id);
  if (!result) notFound();
  if (result.kind === "redirect") redirect(result.to);

  const title = result.date.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  });
  const dateLabel = result.date.toLocaleDateString("de-DE", { timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-2xl">
      <LargeTitle title={title} back={{ href: "/admin/spieltage", label: "Spieltage" }} />
      <SectionLabel>Zusagen</SectionLabel>
      <ParticipantsRoster gameDayId={result.id} participants={result.roster} />
      <div className="mt-4">
        <StartGameDayButton gameDayId={result.id} />
      </div>
      <div className="mt-6">
        <DeleteGameDayButton gameDayId={result.id} dateLabel={dateLabel} />
      </div>
    </div>
  );
}
