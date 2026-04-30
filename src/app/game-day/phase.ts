import type { TimelineStep } from "@/components/ui/timeline";

export type GameDayStatus = "planned" | "in_progress" | "finished";

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

// SSE subscription is only meaningful while the day is being played —
// before that there is nothing to update, after that nothing changes.
export function shouldSubscribeToLiveUpdates(status: GameDayStatus): boolean {
  return status === "in_progress";
}
