import { LABEL } from "@/components/home/styles";
import { dateBlockOf, formatGameDayDate } from "@/lib/format-date";

const SIZES = {
  lg: { box: "text-center", day: "text-[26px]" },
  md: { box: "w-10 shrink-0 text-center", day: "text-2xl" },
} as const;

interface DateBlockProps {
  date: Date;
  size: keyof typeof SIZES;
  /** Spoken before the full date, e.g. "Spieltag ". */
  srPrefix?: string;
}

/** Day number over short month, with the full date for screen readers. */
export function DateBlock({ date, size, srPrefix = "" }: DateBlockProps) {
  const { day, month } = dateBlockOf(date);
  const s = SIZES[size];
  return (
    <span className={s.box}>
      <span className="sr-only">
        {srPrefix}
        {formatGameDayDate(date)}:{" "}
      </span>
      <span aria-hidden="true">
        <span className={`block font-display ${s.day} font-extrabold leading-none tabular-nums`}>{day}</span>
        <span className={LABEL}>{month}</span>
      </span>
    </span>
  );
}
