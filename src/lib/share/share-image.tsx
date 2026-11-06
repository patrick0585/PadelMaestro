import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { splitPodium } from "@/lib/game-day/day-podium";
import type { ShareCard, ShareCardPlayer } from "./share-card";

export const SHARE_IMAGE_SIZE = { width: 1080, height: 1920 };

const MEDAL = { 1: "#fbbf24", 2: "#cbd5e1", 3: "#d97706" } as const;
const LIME = "#bef264";
const SOFT = "#c3d3df"; // secondary text, still legible at chat-thumbnail size

let fonts: Promise<{ name: string; data: Buffer; weight: 700 | 800; style: "normal" }[]> | null = null;
function loadFonts() {
  // Traced into the standalone build via outputFileTracingIncludes in next.config.ts.
  const dir = path.join(process.cwd(), "assets/fonts");
  fonts ??= Promise.all([
    readFile(path.join(dir, "BarlowCondensed-Bold.ttf")).then((data) => ({ name: "Barlow", data, weight: 700 as const, style: "normal" as const })),
    readFile(path.join(dir, "BarlowCondensed-ExtraBold.ttf")).then((data) => ({ name: "Barlow", data, weight: 800 as const, style: "normal" as const })),
  ]).catch((err) => {
    fonts = null; // retry on the next request instead of failing until restart
    throw err;
  });
  return fonts;
}

const DAY = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
export function shareDateLabel(date: Date): string {
  // "Do., 13.11." → "Do 13.11."
  return DAY.format(date).replace(".,", "");
}

function headline(rank: number): string {
  if (rank === 1) return "Tagessieg!";
  if (rank <= 3) return "Starker Tag";
  return "Dabei gewesen";
}

export function seasonLine(move: number | null, rank: number | null): { text: string; up: boolean | null } | null {
  if (rank === null) return null;
  if (move === null || move === 0) return { text: `${move === 0 ? "Gleich geblieben · " : ""}${rank}. in der Saison`, up: null };
  const n = Math.abs(move);
  return { text: `${n} ${n === 1 ? "Platz" : "Plätze"} · jetzt ${rank}. in der Saison`, up: move > 0 };
}

function Medal({ rank, size }: { rank: number; size: number }) {
  const color = MEDAL[rank as 1 | 2 | 3] ?? "#475569";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: size,
        background: color,
        color: "#0b1220",
        fontSize: size * 0.6,
        fontWeight: 800,
      }}
    >
      {rank}
    </div>
  );
}

function Arrow({ up }: { up: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 10 10" style={{ marginRight: 12 }}>
      <path d={up ? "M5 1 L9.5 9 L0.5 9 Z" : "M5 9 L9.5 1 L0.5 1 Z"} fill={up ? LIME : "#cbd5e1"} />
    </svg>
  );
}

/** Up to two names per step, the viewer first, the rest as "+N". */
export function shownNames(players: ShareCardPlayer[]): string[] {
  const ordered = [...players].sort((a, b) => Number(b.isMe) - Number(a.isMe));
  const names = ordered.slice(0, 2).map((p) => p.name);
  if (ordered.length > 2) names[1] = `${names[1]} +${ordered.length - 2}`;
  return names;
}

function Step({ players, rank, first }: { players: ShareCardPlayer[]; rank: number; first: boolean }) {
  const mine = players.some((p) => p.isMe);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: first ? 340 : 290,
        padding: first ? "44px 12px 26px" : "28px 12px 22px",
        borderRadius: "40px 40px 18px 18px",
        background: mine
          ? "linear-gradient(180deg, rgba(190,242,100,0.30), rgba(190,242,100,0.08))"
          : first
            ? "linear-gradient(180deg, rgba(251,191,36,0.28), rgba(255,255,255,0.06))"
            : "rgba(255,255,255,0.07)",
        border: mine ? `6px solid ${LIME}` : first ? "3px solid rgba(251,191,36,0.5)" : "3px solid rgba(255,255,255,0.13)",
      }}
    >
      {mine && (
        <span style={{ marginBottom: 14, padding: "2px 18px", borderRadius: 999, background: LIME, color: "#0b1220", fontSize: 32, fontWeight: 800, letterSpacing: 4 }}>
          DU
        </span>
      )}
      <Medal rank={rank} size={first ? 78 : 64} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 16 }}>
        {shownNames(players).map((name) => (
          <span key={name} style={{ fontSize: 50, fontWeight: 700, color: "#fff", lineHeight: 1.05 }}>
            {name}
          </span>
        ))}
      </div>
      <span style={{ fontSize: first ? 104 : 84, fontWeight: 800, lineHeight: 1, marginTop: 10, color: first ? "#fbbf24" : "#fff" }}>
        {players[0].points}
      </span>
      <span style={{ fontSize: 36, color: SOFT, textTransform: "uppercase", letterSpacing: 3 }}>Punkte</span>
    </div>
  );
}

export async function renderShareImage(card: ShareCard): Promise<ImageResponse> {
  const me = card.me;
  const gold = me?.rank === 1;
  // Same steps as the in-app podium: tied players share a step, missing ranks leave no empty step.
  const { steps } = splitPodium(card.podium);
  const order = [steps[1], steps[0], steps[2]].filter((st) => st !== undefined);
  const season = me ? seasonLine(me.seasonMove, me.seasonRank) : null;
  const date = shareDateLabel(card.date);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          // Instagram covers ~250px at the top (profile bar) and bottom (reply bar) of a story.
          padding: "250px 72px 250px",
          justifyContent: "space-between",
          fontFamily: "Barlow",
          color: "#fff",
          background: gold
            ? "radial-gradient(120% 60% at 50% 0%, #a16207 0%, #3b2a0a 42%, #0b1220 78%)"
            : "radial-gradient(120% 60% at 50% 0%, #0e7490 0%, #0b2a3a 45%, #0b1220 78%)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 52, fontWeight: 800, letterSpacing: 6, textTransform: "uppercase", color: "#e0f7fb" }}>Padelmaestro</span>
          <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: 5, textTransform: "uppercase", color: gold ? "#fde68a" : LIME }}>{date}</span>
        </div>

        {me ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 70 }}>
            <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: 7, textTransform: "uppercase", color: gold ? "#fde68a" : LIME }}>
              Dein Spieltag · {headline(me.rank)}
            </span>
            <div style={{ display: "flex", alignItems: "flex-end", marginTop: 10 }}>
              <span style={{ fontSize: 400, fontWeight: 800, lineHeight: 0.85, color: gold ? "#fbbf24" : LIME }}>{me.rank}.</span>
              <span style={{ fontSize: 110, fontWeight: 800, marginLeft: 18, marginBottom: 30 }}>Platz</span>
            </div>
            <div style={{ display: "flex", marginTop: 44 }}>
              {[
                [String(me.points), "Punkte"],
                [`${me.wins}/${me.matches}`, "Siege"],
                [me.partner ?? "–", "bestes Duo"],
              ].map(([v, l], i) => (
                <div
                  key={l}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    flex: 1,
                    marginLeft: i === 0 ? 0 : 24,
                    padding: "26px 10px",
                    borderRadius: 40,
                    background: "rgba(255,255,255,0.08)",
                  }}
                >
                  <span style={{ fontSize: i === 0 ? 96 : 84, fontWeight: 800, lineHeight: 1, color: i === 0 ? LIME : "#fff" }}>{v}</span>
                  <span style={{ fontSize: 38, color: SOFT, marginTop: 8 }}>{l}</span>
                </div>
              ))}
            </div>
            {season && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  alignSelf: "flex-start",
                  marginTop: 40,
                  padding: "14px 34px",
                  borderRadius: 999,
                  fontSize: 46,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: season.up ? LIME : "#e2e8f0",
                  background: "rgba(11,18,32,0.78)",
                  border: `3px solid ${season.up ? "rgba(190,242,100,0.45)" : "rgba(148,163,184,0.4)"}`,
                }}
              >
                {season.up !== null && <Arrow up={season.up} />}
                {season.text}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 70 }}>
            <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: 7, textTransform: "uppercase", color: LIME }}>Spieltag-Ergebnis</span>
            <span style={{ fontSize: 230, fontWeight: 800, lineHeight: 0.9, marginTop: 10, textTransform: "uppercase" }}>{date}</span>
            <span style={{ fontSize: 44, color: "#cbe9f2", marginTop: 18 }}>{card.groupName}</span>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", borderTop: "6px dashed rgba(255,255,255,0.2)", margin: "0 -72px 40px" }} />
          <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: 6, textTransform: "uppercase", color: SOFT, marginBottom: 26 }}>
            Spieltag · Podium
          </span>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 24 }}>
            {order.map((st) => (
              <Step key={st.rank} rank={st.rank} players={st.players} first={st === steps[0]} />
            ))}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 56, fontSize: 38, color: SOFT }}>
          <span>
            {card.groupName}
            {card.dayNumber ? ` · Spieltag ${card.dayNumber}` : ""}
          </span>
          <span style={{ color: LIME, fontWeight: 700 }}>padelmaestro.de</span>
        </div>
      </div>
    ),
    { ...SHARE_IMAGE_SIZE, fonts: await loadFonts() },
  );
}
