import { resolve } from "node:path";
import XLSX from "xlsx";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { seedInitial } from "./seed-initial";
import { computeRanking } from "../src/lib/ranking/compute";

// XLSX uses "Michael"; our canonical player name is "Michi".
const NAME_ALIASES: Record<string, string> = {
  patrick: "Patrick",
  werner: "Werner",
  michi: "Michi",
  michael: "Michi",
  thomas: "Thomas",
  paul: "Paul",
  rene: "Rene",
  "renè": "Rene",
  "renée": "Rene",
};

function normalizeName(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error(`Expected player-name string, got ${typeof raw}: ${JSON.stringify(raw)}`);
  }
  const key = raw.trim().toLowerCase();
  const mapped = NAME_ALIASES[key];
  if (!mapped) throw new Error(`Unknown player name in XLSX: "${raw}"`);
  return mapped;
}

function parseInteger(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isInteger(raw) ? raw : Math.round(raw);
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function parseDecimal(raw: unknown): number {
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`Cannot parse decimal: ${JSON.stringify(raw)}`);
  return n;
}

function parseDate(raw: unknown): Date {
  if (typeof raw !== "string") {
    throw new Error(`Expected date string, got ${JSON.stringify(raw)}`);
  }
  const cleaned = raw.replace(/^Datum:\s*/i, "").trim();

  const dmy = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return new Date(Date.UTC(year, month - 1, day));
  }

  const mdy = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    let year = Number(mdy[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return new Date(Date.UTC(year, month - 1, day));
  }

  throw new Error(`Cannot parse date: ${JSON.stringify(raw)}`);
}

interface JokerEntry {
  player: string;
  gamesCredited: number;
  ppgAtUse: number;
  pointsCredited: number;
}

function parseJokerCell(raw: unknown): { gamesCredited: number; ppgAtUse: number } | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const parts = raw.trim().split(/[*x×]/);
  if (parts.length !== 2) throw new Error(`Cannot parse joker cell: ${JSON.stringify(raw)}`);
  const [a, b] = parts.map(parseDecimal);
  const aIsInt = Number.isInteger(a);
  const bIsInt = Number.isInteger(b);
  if (aIsInt === bIsInt) {
    throw new Error(`Ambiguous joker cell (need one integer games count and one decimal ppg): ${JSON.stringify(raw)}`);
  }
  const games = aIsInt ? a : b;
  const ppg = aIsInt ? b : a;
  return { gamesCredited: games, ppgAtUse: ppg };
}

interface ParsedMatch {
  matchNumber: number;
  team1: [string, string];
  team2: [string, string];
  team1Score: number;
  team2Score: number;
}

interface ParsedGameDay {
  sheetName: string;
  date: Date;
  matches: ParsedMatch[];
  jokers: JokerEntry[];
  summary: Array<{ player: string; games: number; points: number }>;
}

function parseGameDay(sheetName: string, ws: XLSX.WorkSheet): ParsedGameDay {
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
    header: 1,
    raw: false,
    defval: null,
  });

  const dateRow = rows[1];
  if (!dateRow || dateRow[0] == null) {
    throw new Error(`${sheetName}: missing date row`);
  }
  const date = parseDate(dateRow[0] as string);

  const matchHeaderIdx = rows.findIndex(
    (r) => Array.isArray(r) && r[0] === "Team 1" && r[2] === "Ergebnis",
  );
  if (matchHeaderIdx < 0) throw new Error(`${sheetName}: missing match header`);

  const summaryHeaderIdx = rows.findIndex(
    (r) => Array.isArray(r) && r[2] === "Teilnehmer",
  );

  const matches: ParsedMatch[] = [];
  const end = summaryHeaderIdx > 0 ? summaryHeaderIdx : rows.length;
  for (let i = matchHeaderIdx + 1; i < end; i++) {
    const r = rows[i] ?? [];
    const t1a = r[0];
    const t1b = r[1];
    const s1 = r[2];
    const sep = r[3];
    const s2 = r[4];
    const t2a = r[5];
    const t2b = r[6];
    if (t1a == null && t1b == null && s1 == null && s2 == null) continue;
    if (sep !== ":" && sep !== null) {
      throw new Error(`${sheetName} row ${i}: unexpected separator ${JSON.stringify(sep)}`);
    }
    const score1 = parseInteger(s1);
    const score2 = parseInteger(s2);
    if (score1 === null || score2 === null) continue;
    matches.push({
      matchNumber: matches.length + 1,
      team1: [normalizeName(t1a), normalizeName(t1b)],
      team2: [normalizeName(t2a), normalizeName(t2b)],
      team1Score: score1,
      team2Score: score2,
    });
  }

  const jokers: JokerEntry[] = [];
  const summary: ParsedGameDay["summary"] = [];
  if (summaryHeaderIdx > 0) {
    const hdr = rows[summaryHeaderIdx] ?? [];
    const jokerCol = hdr.findIndex((c) => c === "Joker");
    for (let i = summaryHeaderIdx + 1; i < rows.length; i++) {
      const r = rows[i] ?? [];
      const who = r[2];
      if (typeof who !== "string" || who.trim() === "") continue;
      const player = normalizeName(who);
      const games = parseInteger(r[3]);
      const points = parseInteger(r[4]);
      if (games !== null && points !== null) {
        summary.push({ player, games, points });
      }
      if (jokerCol >= 0) {
        const jc = parseJokerCell(r[jokerCol]);
        if (jc) {
          jokers.push({
            player,
            gamesCredited: jc.gamesCredited,
            ppgAtUse: jc.ppgAtUse,
            pointsCredited: Math.round(jc.gamesCredited * jc.ppgAtUse * 100) / 100,
          });
        }
      }
    }
  }

  return { sheetName, date, matches, jokers, summary };
}

async function wipeAll() {
  // Order respects FK constraints. AuditLog references Player via actorId.
  await prisma.$transaction([
    prisma.auditLog.deleteMany({}),
    prisma.jokerUse.deleteMany({}),
    prisma.match.deleteMany({}),
    prisma.gameDayParticipant.deleteMany({}),
    prisma.gameDay.deleteMany({}),
    prisma.season.deleteMany({}),
    prisma.player.deleteMany({}),
  ]);
}

async function getOrCreateSeasonByYear(year: number, activeYear: number) {
  const existing = await prisma.season.findUnique({ where: { year } });
  if (existing) return existing;
  return prisma.season.create({
    data: {
      year,
      startDate: new Date(Date.UTC(year, 0, 1)),
      endDate: new Date(Date.UTC(year, 11, 31)),
      isActive: year === activeYear,
    },
  });
}

async function importDay(day: ParsedGameDay, playerIdByName: Map<string, string>, activeYear: number) {
  const season = await getOrCreateSeasonByYear(day.date.getUTCFullYear(), activeYear);

  const gameDay = await prisma.gameDay.create({
    data: {
      seasonId: season.id,
      date: day.date,
      status: "finished",
      playerCount: null,
    },
  });

  const participantIds = new Set<string>();
  for (const m of day.matches) {
    for (const n of [...m.team1, ...m.team2]) {
      const id = playerIdByName.get(n);
      if (!id) throw new Error(`${day.sheetName}: unknown player ${n}`);
      participantIds.add(id);
    }
  }
  for (const playerId of participantIds) {
    await prisma.gameDayParticipant.create({
      data: { gameDayId: gameDay.id, playerId, attendance: "confirmed" },
    });
  }

  for (const m of day.matches) {
    await prisma.match.create({
      data: {
        gameDayId: gameDay.id,
        matchNumber: m.matchNumber,
        team1PlayerAId: playerIdByName.get(m.team1[0])!,
        team1PlayerBId: playerIdByName.get(m.team1[1])!,
        team2PlayerAId: playerIdByName.get(m.team2[0])!,
        team2PlayerBId: playerIdByName.get(m.team2[1])!,
        team1Score: m.team1Score,
        team2Score: m.team2Score,
      },
    });
  }

  for (const j of day.jokers) {
    const playerId = playerIdByName.get(j.player);
    if (!playerId) throw new Error(`${day.sheetName}: unknown joker player ${j.player}`);
    await prisma.jokerUse.create({
      data: {
        playerId,
        seasonId: season.id,
        gameDayId: gameDay.id,
        ppgAtUse: new Prisma.Decimal(j.ppgAtUse.toFixed(3)),
        gamesCredited: j.gamesCredited,
        pointsCredited: new Prisma.Decimal(j.pointsCredited.toFixed(2)),
      },
    });
  }

  return { matches: day.matches.length, jokers: day.jokers.length };
}

async function main() {
  const path = process.argv[2] ?? "statistik.xlsx";
  const confirmed = process.argv.includes("--yes");
  if (!confirmed) {
    console.error("This script will DELETE ALL DATA in the database and re-import from XLSX.");
    console.error("Re-run with --yes to confirm:");
    console.error(`  pnpm import:statistik ${path} --yes`);
    process.exit(1);
  }

  const absPath = resolve(process.cwd(), path);
  console.log(`Reading ${absPath} ...`);
  const wb = XLSX.readFile(absPath);

  const days: ParsedGameDay[] = [];
  for (const sheetName of wb.SheetNames) {
    if (!/^Spieltag/i.test(sheetName)) continue;
    const ws = wb.Sheets[sheetName];
    const parsed = parseGameDay(sheetName, ws);
    if (parsed.matches.length === 0) {
      console.warn(`  skip ${sheetName}: no matches`);
      continue;
    }
    days.push(parsed);
  }
  days.sort((a, b) => a.date.getTime() - b.date.getTime());
  console.log(`Parsed ${days.length} game days.`);

  const activeYear = Math.max(...days.map((d) => d.date.getUTCFullYear()));

  console.log("Wiping database ...");
  await wipeAll();

  console.log("Seeding players ...");
  const envPassword = process.env.INITIAL_ADMIN_PASSWORD;
  const { adminPassword } = await seedInitial({
    adminPassword: envPassword && envPassword.length > 0 ? envPassword : undefined,
  });
  const players = await prisma.player.findMany({ select: { id: true, name: true } });
  const playerIdByName = new Map(players.map((p) => [p.name, p.id]));

  console.log("Importing game days ...");
  let totalMatches = 0;
  let totalJokers = 0;
  for (const day of days) {
    const { matches, jokers } = await importDay(day, playerIdByName, activeYear);
    totalMatches += matches;
    totalJokers += jokers;
    console.log(
      `  ${day.sheetName.padEnd(12)} ${day.date.toISOString().slice(0, 10)}  ` +
        `matches=${matches} jokers=${jokers}`,
    );
  }

  const seasonActive = await prisma.season.findUnique({ where: { year: activeYear } });
  if (seasonActive && !seasonActive.isActive) {
    await prisma.season.updateMany({ where: { isActive: true }, data: { isActive: false } });
    await prisma.season.update({ where: { id: seasonActive.id }, data: { isActive: true } });
  }

  console.log("\n=== Summary ===");
  console.log(`Game days: ${days.length}`);
  console.log(`Matches:   ${totalMatches}`);
  console.log(`Jokers:    ${totalJokers}`);

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (season) {
    const ranking = await computeRanking(season.id);
    console.log(`\nComputed ranking (active season ${season.year}):`);
    for (const r of ranking) {
      console.log(
        `  ${String(r.rank).padStart(2)}. ${r.playerName.padEnd(8)} ` +
          `games=${String(r.games).padStart(3)} pts=${r.points.toFixed(2).padStart(6)} ` +
          `ppg=${r.pointsPerGame.toFixed(2)} jokers=${r.jokersUsed}`,
      );
    }
  }

  console.log(`\nAdmin temp password: ${adminPassword}`);
  if (!envPassword || envPassword.length === 0) {
    console.warn(`IMPORTANT: log in at /login and change this password via /profil immediately.`);
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
