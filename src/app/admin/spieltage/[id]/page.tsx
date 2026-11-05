import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { loadPlannedGameDay } from "@/lib/admin/game-days";
import { LargeTitle, SectionLabel } from "@/components/ui/list";
import { AdminTicket, AttendanceBar, attendanceCaption, countdownPill } from "../../admin-ticket";
import { ParticipantsRoster } from "../../participants-roster";
import { StartGameDayButton } from "../../start-game-day-button";
import { DeleteGameDayButton } from "../../delete-game-day-button";
import { StartTimeEditor } from "../../start-time-editor";

export const dynamic = "force-dynamic";

export default async function AdminGameDayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAdmin();
  const result = await loadPlannedGameDay(ctx.groupId, id);
  if (!result) notFound();
  if (result.kind === "redirect") redirect(result.to);

  const count = (a: string) => result.roster.filter((r) => r.attendance === a).length;
  const counts = { confirmed: count("confirmed"), declined: count("declined"), joker: count("joker"), pending: count("pending") };
  const dateLabel = result.date.toLocaleDateString("de-DE", { timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-2xl">
      <LargeTitle title="Spieltag" back={{ href: "/admin/spieltage", label: "Spieltage" }} />
      <AdminTicket label="Spieltag · geplant" date={result.date} startTime={result.startTime} pill={countdownPill(result.date)}>
        <AttendanceBar counts={counts} decorative />
        <p className="mt-2 text-[13px] text-[#d9f6fb]">{attendanceCaption(counts)}</p>
      </AdminTicket>
      <SectionLabel>Zusagen</SectionLabel>
      <ParticipantsRoster
        gameDayId={result.id}
        participants={result.roster}
        jokersTotal={result.rules.jokersPerSeason}
        jokerGamesCredited={result.rules.jokerGamesCredited}
      />
      <div className="mt-4">
        <StartTimeEditor gameDayId={result.id} startTime={result.startTime} />
      </div>
      <div className="mt-4">
        <StartGameDayButton gameDayId={result.id} />
      </div>
      <div className="mt-6">
        <DeleteGameDayButton gameDayId={result.id} dateLabel={dateLabel} />
      </div>
    </div>
  );
}
