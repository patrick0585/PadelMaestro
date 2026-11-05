/** Places gained since the previous finished day; renders nothing when unchanged or unknown. */
export function Movement({ value }: { value: number | null }) {
  if (value === null || value === 0) return <span />;
  const up = value > 0;
  const n = Math.abs(value);
  return (
    <span className={`font-display text-xs font-bold tabular-nums ${up ? "text-lime" : "text-rose-400"}`}>
      <span aria-hidden="true">
        {up ? "▲" : "▼"}
        {n}
      </span>
      <span className="sr-only">
        {n} {n === 1 ? "Platz" : "Plätze"} {up ? "hoch" : "runter"} seit dem letzten Spieltag
      </span>
    </span>
  );
}
