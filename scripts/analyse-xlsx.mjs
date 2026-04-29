// One-shot analysis tool: cross-checks the historical statistik.xlsx
// against the current pairing templates. The .xlsx itself is gitignored
// — pass its path as the first arg or via XLSX_PATH.
//
//   node scripts/analyse-xlsx.mjs ./statistik.xlsx
//   XLSX_PATH=./statistik.xlsx node scripts/analyse-xlsx.mjs

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import XLSX from "xlsx";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const xlsxPath = process.argv[2] ?? process.env.XLSX_PATH;
if (!xlsxPath) {
  console.error("usage: node scripts/analyse-xlsx.mjs <path-to-statistik.xlsx>");
  console.error("       (or set XLSX_PATH=...)");
  process.exit(1);
}

const wb = XLSX.readFile(resolve(process.cwd(), xlsxPath));

const ALIASES = {
  patrick: "P", werner: "W", michi: "M", michael: "M",
  thomas: "T", paul: "L", rene: "R", "renè": "R", "renée": "R",
};
const norm = (raw) => {
  if (typeof raw !== "string") return null;
  return ALIASES[raw.trim().toLowerCase()] ?? null;
};

function parse(sheetName, ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });
  const hdr = rows.findIndex((r) => Array.isArray(r) && r[0] === "Team 1" && r[2] === "Ergebnis");
  if (hdr < 0) return null;
  const sumHdr = rows.findIndex((r) => Array.isArray(r) && r[2] === "Teilnehmer");
  const matches = [];
  const end = sumHdr > 0 ? sumHdr : rows.length;
  for (let i = hdr + 1; i < end; i++) {
    const r = rows[i] ?? [];
    const [t1a, t1b, s1, sep, s2, t2a, t2b] = r;
    if (t1a == null && t1b == null) continue;
    const n1 = norm(t1a), n2 = norm(t1b), n3 = norm(t2a), n4 = norm(t2b);
    if (!n1 || !n2 || !n3 || !n4) continue;
    matches.push({ t1: [n1, n2].sort(), t2: [n3, n4].sort() });
  }
  return { sheetName, matches };
}

function analyse(day) {
  const players = new Set();
  const gamesPerPlayer = {};
  const restRuns = {};
  const playRuns = {};
  for (const m of day.matches) {
    for (const p of [...m.t1, ...m.t2]) {
      players.add(p);
      gamesPerPlayer[p] = (gamesPerPlayer[p] || 0) + 1;
    }
  }
  for (const p of players) { restRuns[p] = []; playRuns[p] = []; }

  // For each player, compute longest run of consecutive played/rested matches
  for (const p of players) {
    let playRun = 0, restRun = 0;
    for (const m of day.matches) {
      const playing = m.t1.includes(p) || m.t2.includes(p);
      if (playing) { playRun++; if (restRun) { restRuns[p].push(restRun); restRun = 0; } }
      else { restRun++; if (playRun) { playRuns[p].push(playRun); playRun = 0; } }
    }
    if (playRun) playRuns[p].push(playRun);
    if (restRun) restRuns[p].push(restRun);
  }

  // back-to-back same team count
  let sameTeamBack = 0;
  for (let i = 1; i < day.matches.length; i++) {
    const a = day.matches[i - 1], b = day.matches[i];
    const teams = [a.t1.join(""), a.t2.join(""), b.t1.join(""), b.t2.join("")];
    const uniq = new Set(teams);
    if (uniq.size < teams.length) sameTeamBack++;
  }

  return {
    n: day.matches.length,
    players: [...players].sort(),
    gamesPerPlayer,
    maxPlayRun: Math.max(...Object.values(playRuns).flatMap(r => r.length ? r : [0])),
    maxRestRun: Math.max(...Object.values(restRuns).flatMap(r => r.length ? r : [0])),
    sameTeamBack,
  };
}

const results = { 4: [], 5: [], 6: [] };
for (const name of wb.SheetNames) {
  if (!/^Spieltag/i.test(name)) continue;
  const p = parse(name, wb.Sheets[name]);
  if (!p || p.matches.length === 0) continue;
  const a = analyse(p);
  if (results[a.players.length]) {
    results[a.players.length].push({ sheet: name, ...a, matches: p.matches });
  }
}

for (const [n, days] of Object.entries(results)) {
  if (!days.length) continue;
  console.log(`\n=== ${n} Spieler — ${days.length} Spieltage ===`);
  for (const d of days) {
    console.log(`  ${d.sheet.padEnd(14)} Matches:${d.n} players:[${d.players.join(",")}] games:${JSON.stringify(d.gamesPerPlayer)} maxPlayRun:${d.maxPlayRun} maxRestRun:${d.maxRestRun} backToBackSameTeam:${d.sameTeamBack}`);
  }
  // Show full match order for first day of each count
  console.log(`\n  First day (${days[0].sheet}) full order:`);
  for (let i = 0; i < days[0].matches.length; i++) {
    const m = days[0].matches[i];
    console.log(`    ${String(i+1).padStart(2)}. ${m.t1.join("+")} vs ${m.t2.join("+")}`);
  }
}

// Now analyse the current template for comparison
console.log("\n\n=== Aktuelles Template 6-Spieler ===");
const tpl6 = JSON.parse(await readFile(
  resolve(repoRoot, "src/lib/pairings/templates/6-players.json"), "utf8"));
const tplDay = {
  matches: tpl6.matches.map((m) => ({ t1: [...m.team1].sort(), t2: [...m.team2].sort() }))
};
const ta = analyse(tplDay);
console.log(`  Matches:${ta.n} maxPlayRun:${ta.maxPlayRun} maxRestRun:${ta.maxRestRun} backToBackSameTeam:${ta.sameTeamBack}`);
console.log(`  games per position:`, ta.gamesPerPlayer);

console.log("\n=== Aktuelles Template 5-Spieler ===");
const tpl5 = JSON.parse(await readFile(
  resolve(repoRoot, "src/lib/pairings/templates/5-players.json"), "utf8"));
const tpl5Day = {
  matches: tpl5.matches.map((m) => ({ t1: [...m.team1].sort(), t2: [...m.team2].sort() }))
};
const ta5 = analyse(tpl5Day);
console.log(`  Matches:${ta5.n} maxPlayRun:${ta5.maxPlayRun} maxRestRun:${ta5.maxRestRun} backToBackSameTeam:${ta5.sameTeamBack}`);
console.log(`  games per position:`, ta5.gamesPerPlayer);
