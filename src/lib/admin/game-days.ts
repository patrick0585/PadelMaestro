import type { ParticipantAttendance, RosterRow } from "@/app/admin/participants-roster";

export type ParticipantWithPlayer = {
  playerId: string;
  attendance: ParticipantAttendance;
  player: { id: string; name: string };
};

export function buildRosterRows(
  participants: ParticipantWithPlayer[],
  activePlayers: { id: string; name: string }[],
  jokersRemainingByPlayer: Map<string, number>,
): RosterRow[] {
  const byId = new Map(participants.map((p) => [p.playerId, p]));
  return activePlayers
    .map((player) => {
      const participant = byId.get(player.id);
      const attendance: ParticipantAttendance =
        participant?.attendance === "confirmed" ||
        participant?.attendance === "declined" ||
        participant?.attendance === "joker"
          ? participant.attendance
          : "pending";
      return {
        playerId: player.id,
        name: player.name,
        attendance,
        jokersRemaining: jokersRemainingByPlayer.get(player.id) ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}
