import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function loadTemplate(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function score(matches, playerCount) {
  let sameTeamBack = 0;
  for (let i = 1; i < matches.length; i++) {
    const a = matches[i - 1];
    const b = matches[i];
    const teams = [
      [...a.team1].sort().join(","),
      [...a.team2].sort().join(","),
      [...b.team1].sort().join(","),
      [...b.team2].sort().join(","),
    ];
    if (new Set(teams).size < teams.length) sameTeamBack++;
  }

  const plays = new Array(playerCount + 1).fill(0);
  let maxSpread = 0;
  for (const m of matches) {
    for (const p of m.team1) plays[p]++;
    for (const p of m.team2) plays[p]++;
    const vals = plays.slice(1);
    const spread = Math.max(...vals) - Math.min(...vals);
    maxSpread = Math.max(maxSpread, spread);
  }

  let maxPlayRun = 0;
  let maxRestRun = 0;
  for (let p = 1; p <= playerCount; p++) {
    let pr = 0;
    let rr = 0;
    for (const m of matches) {
      const playing = m.team1.includes(p) || m.team2.includes(p);
      if (playing) {
        pr++;
        maxRestRun = Math.max(maxRestRun, rr);
        rr = 0;
      } else {
        rr++;
        maxPlayRun = Math.max(maxPlayRun, pr);
        pr = 0;
      }
    }
    maxPlayRun = Math.max(maxPlayRun, pr);
    maxRestRun = Math.max(maxRestRun, rr);
  }

  return { sameTeamBack, maxPlayRun, maxRestRun, maxSpread };
}

// Partition matches into consecutive rounds where each player plays exactly
// roundPlays times per round. Returns the round size & rounds, or null.
function partitionIntoRounds(matches, playerCount) {
  // Try round sizes that divide matches.length.
  for (const size of [3, 2, 1]) {
    if (matches.length % size !== 0) continue;
    const rounds = [];
    for (let i = 0; i < matches.length; i += size) {
      rounds.push(matches.slice(i, i + size));
    }
    // Verify: in every round, every player plays the same number of times.
    let ok = true;
    let target = null;
    for (const r of rounds) {
      const c = new Array(playerCount + 1).fill(0);
      for (const m of r) {
        for (const p of m.team1) c[p]++;
        for (const p of m.team2) c[p]++;
      }
      const vals = c.slice(1);
      const first = vals[0];
      if (vals.some((v) => v !== first)) {
        ok = false;
        break;
      }
      if (target === null) target = first;
      else if (target !== first) {
        ok = false;
        break;
      }
    }
    if (ok) return { size, rounds };
  }
  return null;
}

function* permutations(arr) {
  if (arr.length <= 1) {
    yield arr.slice();
    return;
  }
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) yield [arr[i], ...p];
  }
}

function sameTeamBetween(a, b) {
  const teams = [
    [...a.team1].sort().join(","),
    [...a.team2].sort().join(","),
    [...b.team1].sort().join(","),
    [...b.team2].sort().join(","),
  ];
  return new Set(teams).size < teams.length;
}

// For each round, cache every inner permutation and its boundary match-signatures.
// Returns array of arrays of { seq, firstSig, lastSig, innerSameTeamBack }.
function enumerateRoundPermutations(round) {
  const perms = [];
  for (const seq of permutations(round)) {
    let inner = 0;
    for (let i = 1; i < seq.length; i++) {
      if (sameTeamBetween(seq[i - 1], seq[i])) inner++;
    }
    perms.push({ seq, first: seq[0], last: seq[seq.length - 1], inner });
  }
  return perms;
}

// Search: pick an order of rounds, then for each round pick an inner permutation
// that keeps boundary back-to-back at 0 (or minimal).
// Structured DFS over rounds; at each step enumerate round-permutations ordered
// by innerSameTeamBack, require compatibility at the boundary.
function searchOrdering(rounds) {
  const roundCount = rounds.length;
  const allPerms = rounds.map(enumerateRoundPermutations);
  for (const ps of allPerms) ps.sort((a, b) => a.inner - b.inner);

  let best = null;

  for (const roundOrder of permutations([...Array(roundCount).keys()])) {
    const chosen = new Array(roundCount);

    const dfs = (depth, prevLast, innerSum) => {
      if (best && innerSum > best.innerSum) return;
      if (depth === roundCount) {
        best = { roundOrder: [...roundOrder], chosen: chosen.slice(), innerSum };
        return;
      }
      const roundIdx = roundOrder[depth];
      for (const perm of allPerms[roundIdx]) {
        if (prevLast && sameTeamBetween(prevLast, perm.first)) continue;
        chosen[depth] = perm;
        dfs(depth + 1, perm.last, innerSum + perm.inner);
        if (best && best.innerSum === 0) return;
      }
    };

    dfs(0, null, 0);
    if (best && best.innerSum === 0) break;
  }

  if (!best) return null;
  const matches = [];
  for (const perm of best.chosen) matches.push(...perm.seq);
  return matches;
}

function optimise(path) {
  const tpl = loadTemplate(path);
  const before = score(tpl.matches, tpl.playerCount);
  console.log(`\n=== ${path} (${tpl.playerCount} Spieler) ===`);
  console.log(`Vorher:`, before);

  const part = partitionIntoRounds(tpl.matches, tpl.playerCount);
  if (!part) {
    console.log("  Keine Runden-Partition gefunden, Template unverändert.");
    return { newTpl: tpl, before, after: before, changed: false };
  }
  console.log(`  Runden-Struktur: ${part.rounds.length} Runden à ${part.size} Matches`);

  const reordered = searchOrdering(part.rounds);
  if (!reordered) {
    console.log("  Kein gültiges Ordering gefunden.");
    return { newTpl: tpl, before, after: before, changed: false };
  }

  const after = score(reordered, tpl.playerCount);
  console.log(`Nachher:`, after);

  const newTpl = {
    ...tpl,
    matches: reordered.map((m, i) => ({
      matchNumber: i + 1,
      team1: m.team1,
      team2: m.team2,
      sitting: m.sitting,
    })),
  };

  return { newTpl, before, after, changed: after.sameTeamBack < before.sameTeamBack };
}

function formatTemplate(tpl) {
  const count = tpl.matches.length;
  const width = String(count).length;
  const pad = (n) => String(n).padStart(width, " ");
  const lines = tpl.matches.map((m) =>
    `    { "matchNumber": ${pad(m.matchNumber)}, "team1": [${m.team1.join(", ")}], "team2": [${m.team2.join(", ")}], "sitting": [${m.sitting.join(", ")}] }`,
  );
  return (
    `{\n` +
    `  "playerCount": ${tpl.playerCount},\n` +
    `  "format": ${JSON.stringify(tpl.format)},\n` +
    `  "totalMatches": ${tpl.totalMatches},\n` +
    `  "matches": [\n` +
    lines.join(",\n") +
    `\n  ]\n}\n`
  );
}

const WRITE = process.argv.includes("--write");

const root = resolve(process.cwd(), "src/lib/pairings/templates");
for (const file of ["4-players.json", "5-players.json", "6-players.json"]) {
  const path = `${root}/${file}`;
  const { newTpl, changed } = optimise(path);
  if (WRITE && changed) {
    writeFileSync(path, formatTemplate(newTpl), "utf8");
    console.log(`  → geschrieben`);
  }
  if (!WRITE) {
    console.log(`  Vorschau:`);
    newTpl.matches.forEach((m) => {
      console.log(`    ${String(m.matchNumber).padStart(2)}. [${m.team1.join(",")}] vs [${m.team2.join(",")}]  Pause: [${m.sitting.join(",")}]`);
    });
  }
}
