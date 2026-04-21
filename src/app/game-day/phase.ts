import type { TimelineStep } from "@/components/ui/timeline";

export type GameDayStatus = "planned" | "roster_locked" | "in_progress" | "finished";

const LABELS = ["Geplant", "Roster", "Matches", "Fertig"];
const ORDER: GameDayStatus[] = ["planned", "roster_locked", "in_progress", "finished"];

export function timelineForStatus(status: GameDayStatus): TimelineStep[] {
  const currentIndex = ORDER.indexOf(status);
  return LABELS.map((label, index) => {
    let stepStatus: TimelineStep["status"];
    if (status === "finished") {
      stepStatus = "done";
    } else if (index < currentIndex) {
      stepStatus = "done";
    } else if (index === currentIndex) {
      stepStatus = "current";
    } else {
      stepStatus = "upcoming";
    }
    return { id: ORDER[index]!, label, status: stepStatus };
  });
}
