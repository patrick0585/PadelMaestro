import { z } from "zod";

/** Anpfiff als Ortszeit "HH:MM" (Europe/Berlin), z. B. "18:00". */
export const startTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export function startTimeMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function withStartTime(dateLabel: string, startTime: string | null | undefined): string {
  return startTime ? `${dateLabel} · ${startTime} Uhr` : dateLabel;
}
