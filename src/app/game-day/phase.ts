import type { TimelineStep } from "@/components/ui/timeline";

export type GameDayStatus = "planned" | "roster_locked" | "in_progress" | "finished";

type UiStepId = "planned" | "matches" | "finished";
const STEPS: { id: UiStepId; label: string }[] = [
  { id: "planned", label: "Geplant" },
  { id: "matches", label: "Matches" },
  { id: "finished", label: "Fertig" },
];

function uiIndexFor(status: GameDayStatus): number {
  switch (status) {
    case "planned":
      return 0;
    case "roster_locked":
    case "in_progress":
      return 1;
    case "finished":
      return 2;
  }
}

export function timelineForStatus(status: GameDayStatus): TimelineStep[] {
  const currentIndex = uiIndexFor(status);
  return STEPS.map((step, index) => {
    let stepStatus: TimelineStep["status"];
    if (index < currentIndex) stepStatus = "done";
    else if (index === currentIndex) stepStatus = "current";
    else stepStatus = "upcoming";
    return { id: step.id, label: step.label, status: stepStatus };
  });
}
