import { LABEL, MEDAL } from "./styles";

export function TrophyShelf({ medals }: { medals: { gold: number; silver: number; bronze: number } }) {
  const total = medals.gold + medals.silver + medals.bronze;
  const items = [
    { key: "gold", emoji: MEDAL[1], label: "Gold", n: medals.gold },
    { key: "silver", emoji: MEDAL[2], label: "Silber", n: medals.silver },
    { key: "bronze", emoji: MEDAL[3], label: "Bronze", n: medals.bronze },
  ];
  return (
    <section aria-label="Pokalregal" className="rounded-[18px] border border-border bg-surface px-3.5 pt-3">
      <div className={`flex items-baseline justify-between ${LABEL}`}>
        <span>Pokalregal</span>
        <span>
          {total} {total === 1 ? "Medaille" : "Medaillen"}
        </span>
      </div>
      <ul className="mt-1.5 grid grid-cols-3 gap-2 border-b-[3px] border-slate-400/25">
        {items.map((m) => (
          <li
            key={m.key}
            className={`flex items-center justify-center gap-2 rounded-t-xl rounded-b-sm pb-2 pt-1.5 ${
              m.key === "gold" && m.n > 0
                ? "bg-[radial-gradient(80%_90%_at_50%_0%,rgba(251,191,36,0.20),transparent_75%)]"
                : "bg-[linear-gradient(#ffffff0d,transparent)]"
            }`}
          >
            <span
              aria-hidden="true"
              className={`text-[30px] leading-none ${m.n === 0 ? "opacity-35 grayscale" : m.key === "gold" ? "drop-shadow-[0_0_14px_rgba(251,191,36,0.6)]" : "drop-shadow-[0_6px_10px_rgba(0,0,0,0.5)]"}`}
            >
              {m.emoji}
            </span>
            <span>
              <strong className="block font-display text-[30px] font-extrabold leading-none tabular-nums">{m.n}</strong>
              <span className="block text-[11.5px] leading-tight text-foreground-muted">{m.label}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
