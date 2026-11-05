import { Avatar } from "@/components/ui/avatar";
import type { PartnerStat } from "@/lib/player/season-stats";
import { MIN_DUO_MATCHES } from "@/lib/player/partner-ranking";
import { LABEL } from "@/components/home/styles";

const TONE = {
  best: {
    row: "bg-[linear-gradient(90deg,rgba(190,242,100,0.12),transparent_70%)] shadow-[inset_3px_0_0_var(--success)]",
    kicker: "text-lime-200",
    num: "text-lime",
    bar: "bg-lime",
  },
  worst: {
    row: "bg-[linear-gradient(90deg,rgba(251,113,133,0.10),transparent_70%)] shadow-[inset_3px_0_0_#fb7185]",
    kicker: "text-rose-200",
    num: "text-rose-300",
    bar: "bg-rose-400",
  },
  plain: { row: "", kicker: "", num: "", bar: "bg-primary" },
};

const avg = (p: PartnerStat) => p.pointsTogether / p.matches;

function meta(p: PartnerStat) {
  return `${p.matches} ${p.matches === 1 ? "Match" : "Matches"} · ${Math.round((p.wins / p.matches) * 100)}% Siege · ${p.pointsTogether} Pkt`;
}

function Row({
  p,
  rank,
  tone,
  maxAvg,
}: {
  p: PartnerStat;
  rank: number | null;
  tone: keyof typeof TONE;
  maxAvg: number;
}) {
  const t = TONE[tone];
  const kicker = tone === "best" ? "Bestes Duo" : tone === "worst" ? "Weniger Glück" : null;
  return (
    <li className={`grid grid-cols-[22px_32px_1fr_auto] items-center gap-2.5 px-3.5 py-3 ${t.row}`}>
      <span className="text-center font-display text-[20px] font-extrabold tabular-nums text-foreground-muted">
        {rank !== null && <span className="sr-only">Platz </span>}
        {rank ?? "–"}
      </span>
      <Avatar playerId={p.playerId} name={p.name} avatarVersion={p.avatarVersion} size={32} />
      <div className={`min-w-0 ${rank === null ? "opacity-60" : ""}`}>
        {kicker && (
          <p className={`font-display text-[11px] font-bold uppercase tracking-[0.14em] ${t.kicker}`}>{kicker}</p>
        )}
        <p className="truncate text-[15px] font-semibold">{p.name}</p>
        <p className="mt-0.5 text-xs text-foreground-muted">{meta(p)}</p>
        {rank !== null && (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-400/15" aria-hidden="true">
            <i className={`block h-full rounded-full ${t.bar}`} style={{ width: `${maxAvg > 0 ? (avg(p) / maxAvg) * 100 : 0}%` }} />
          </div>
        )}
      </div>
      <p className={`font-display text-[26px] font-extrabold leading-none tabular-nums ${rank === null ? "opacity-60" : t.num}`}>
        {avg(p).toFixed(1)}
        <span className="sr-only"> Punkte pro Match</span>
      </p>
    </li>
  );
}

export function DuoOverview({
  partners,
  bestId,
  worstId,
}: {
  partners: PartnerStat[];
  bestId: string | null;
  worstId: string | null;
}) {
  if (partners.length === 0) {
    return (
      <p className="rounded-[18px] border border-dashed border-border p-4 text-sm text-foreground-muted">
        Noch keine gemeinsamen Matches in dieser Saison.
      </p>
    );
  }
  // Mirrors rankPartners: while nobody has MIN_DUO_MATCHES yet, everyone is ranked.
  const eligible = partners.filter((p) => p.matches >= MIN_DUO_MATCHES);
  const ranked = eligible.length > 0 ? eligible : partners;
  const low = eligible.length > 0 ? partners.filter((p) => p.matches < MIN_DUO_MATCHES) : [];
  const maxAvg = Math.max(...ranked.map(avg));
  const tone = (p: PartnerStat) => (p.playerId === bestId ? "best" : p.playerId === worstId ? "worst" : "plain");

  return (
    <div className="space-y-3.5">
      {ranked.length > 0 && (
        <div className="overflow-hidden rounded-[18px] border border-border bg-surface">
          <div className={`flex justify-between border-b border-border px-3.5 py-2.5 ${LABEL}`}>
            <span id="duos-ranked">Partner</span>
            <span aria-hidden="true">Pkt / Match</span>
          </div>
          <ul aria-labelledby="duos-ranked" className="divide-y divide-border">
            {ranked.map((p, i) => (
              <Row key={p.playerId} p={p} rank={i + 1} tone={tone(p)} maxAvg={maxAvg} />
            ))}
          </ul>
        </div>
      )}
      {low.length > 0 && (
        <>
          <h2 id="duos-low" className={`px-1 ${LABEL}`}>
            Unter {MIN_DUO_MATCHES} gemeinsamen Matches
          </h2>
          <ul aria-labelledby="duos-low" className="divide-y divide-border overflow-hidden rounded-[18px] border border-border bg-surface">
            {low.map((p) => (
              <Row key={p.playerId} p={p} rank={null} tone="plain" maxAvg={maxAvg} />
            ))}
          </ul>
        </>
      )}
      <p className="px-1 text-[11.5px] leading-snug text-foreground-muted">
        Bestes und Schlechtestes Duo zählen ab {MIN_DUO_MATCHES} gemeinsamen Matches. Fehlen die noch, zählen alle.
      </p>
    </div>
  );
}
