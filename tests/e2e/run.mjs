// End-to-end multi-context test for Padel Tracker.
// Drives 6 concurrent browser contexts (1 admin + 5 players) through a full
// game-day lifecycle. Captures screenshots on failures into the artifacts dir
// and emits a JSON+text findings log to stdout.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3000";
const ART = path.resolve("tests/e2e/artifacts");
if (!existsSync(ART)) await mkdir(ART, { recursive: true });

const findings = [];
const log = (...args) => {
  // eslint-disable-next-line no-console
  console.log("[e2e]", ...args);
};

function record(level, code, detail) {
  const entry = { level, code, detail, t: new Date().toISOString() };
  findings.push(entry);
  log(`${level.toUpperCase()} ${code}:`, detail);
}

async function shot(page, name) {
  const p = path.join(ART, `${name}.png`);
  try {
    await page.screenshot({ path: p, fullPage: true });
  } catch (err) {
    log("screenshot failed", name, err.message);
  }
  return p;
}

// Admin credentials come from the env so the script doesn't ship a
// password to git. Bootstrap a local admin first via:
//   pnpm bootstrap:admin <email> "<name>"
// then export E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD before running.
const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!E2E_ADMIN_EMAIL || !E2E_ADMIN_PASSWORD) {
  console.error(
    "set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD before running this driver",
  );
  process.exit(2);
}

// Demo player credentials match scripts/seed-demo.ts (idempotent fixtures).
const DEMO_PASSWORD = "demo12345";

// Each user gets a context with its own cookie jar.
const USERS = [
  { key: "admin", email: E2E_ADMIN_EMAIL, password: E2E_ADMIN_PASSWORD, isAdmin: true, viewport: { width: 1280, height: 800 } },
  { key: "anna", email: "anna@demo.local", password: DEMO_PASSWORD, viewport: { width: 1280, height: 800 } },
  { key: "ben", email: "ben@demo.local", password: DEMO_PASSWORD, viewport: { width: 375, height: 812 }, mobile: true },
  { key: "clara", email: "clara@demo.local", password: DEMO_PASSWORD, viewport: { width: 1280, height: 800 } },
  { key: "daniel", email: "daniel@demo.local", password: DEMO_PASSWORD, viewport: { width: 1280, height: 800 } },
  { key: "eva", email: "eva@demo.local", password: DEMO_PASSWORD, viewport: { width: 375, height: 812 }, mobile: true },
];

const consoleErrors = new Map(); // key -> array of msgs

function attachDiagnostics(key, page) {
  consoleErrors.set(key, []);
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      const txt = msg.text();
      // Filter out noisy expected dev warnings
      if (/Failed to load resource: the server responded with a status of (404|401)/.test(txt)) return;
      if (/Download the React DevTools/.test(txt)) return;
      consoleErrors.get(key).push(`[${msg.type()}] ${txt}`);
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.get(key).push(`[pageerror] ${err.message}`);
  });
  page.on("response", (resp) => {
    const url = resp.url();
    if (url.startsWith(BASE) && resp.status() >= 500) {
      record("critical", "server-5xx", { user: key, url, status: resp.status() });
    }
  });
}

async function login(context, user) {
  const page = await context.newPage();
  attachDiagnostics(user.key, page);
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("domcontentloaded");
  await page.locator("#identifier").fill(user.email);
  await page.locator("#password").fill(user.password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }).catch(() => null),
    page.locator('button[type="submit"]').click(),
  ]);
  await page.waitForLoadState("domcontentloaded");
  if (page.url().includes("/login")) {
    await shot(page, `login-failed-${user.key}`);
    throw new Error(`Login failed for ${user.key} — still on /login`);
  }
  return page;
}

async function ensureNotOnLogin(page, label, userKey) {
  if (page.url().includes("/login")) {
    await shot(page, `bumped-to-login-${userKey}-${label}`);
    record("critical", "auth-bumped-to-login", {
      user: userKey,
      checkpoint: label,
      url: page.url(),
    });
    return false;
  }
  return true;
}

function todayISO() {
  // Use tomorrow if today already exists — but we'll try today first and fall
  // back to scanning forward.
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function plusDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function adminCreateAndStartDay(adminPage) {
  await adminPage.goto(`${BASE}/admin`);
  await adminPage.waitForLoadState("domcontentloaded");

  // If a day is already in_progress, /game-day shows it but /admin only shows
  // planned/roster_locked days. We may already have a manageable day.
  const hasOpen = await adminPage.getByText("Offener Spieltag", { exact: false }).count();
  const hasRunning = await adminPage.getByText("Spieltag läuft", { exact: false }).count();
  const hasManageable = hasOpen + hasRunning > 0;

  let createdDate = null;
  if (!hasManageable) {
    let attempt = 0;
    while (attempt < 14) {
      const d = plusDaysISO(attempt);
      await adminPage.locator("#game-day-date").fill(d);
      await Promise.all([
        adminPage.waitForResponse(
          (r) => r.url().endsWith("/api/game-days") && r.request().method() === "POST",
          { timeout: 10000 },
        ).catch(() => null),
        adminPage.locator('button:has-text("Spieltag anlegen")').click(),
      ]);
      await adminPage.waitForLoadState("domcontentloaded");
      const errorTxt = await adminPage
        .locator("text=Für diesen Tag existiert bereits ein Spieltag")
        .first()
        .count();
      if (errorTxt === 0) {
        createdDate = d;
        break;
      }
      attempt++;
    }
    if (!createdDate) throw new Error("Could not create a game day in 14 attempts");
    log("Admin created game-day for", createdDate);
  } else {
    log("Reusing existing manageable day");
  }

  // Wait for the participant roster (rendered after server refresh).
  for (let attempt = 0; attempt < 3; attempt++) {
    const ok = await adminPage
      .waitForSelector("text=Spielerpool", { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (ok) break;
    log(`Spielerpool not visible (attempt ${attempt + 1}); reloading admin`);
    await adminPage.reload({ waitUntil: "domcontentloaded" });
    await adminPage.waitForTimeout(800);
  }

  // Confirm 5 players (Anna, Ben, Clara, Daniel, Eva) by clicking the
  // "→" arrow on each pool card. Use xpath to scope to the right card.
  const playerNames = ["Anna", "Ben", "Clara", "Daniel", "Eva"];
  for (const name of playerNames) {
    const btn = adminPage.locator(
      `xpath=//button[@aria-label="Zu Dabei verschieben" and ../span[contains(., "${name}")]]`,
    );
    const count = await btn.count();
    if (count > 0) {
      await btn.first().click();
      await adminPage.waitForTimeout(250);
      log(`Confirmed ${name}`);
    } else {
      log(`No move-to-roster button for ${name} (already confirmed or missing)`);
    }
  }

  // Wait for last patch to settle.
  await adminPage.waitForLoadState("domcontentloaded");
  await adminPage.waitForTimeout(500);

  // Start the game day.
  const startBtn = adminPage.locator('button:has-text("Spieltag starten")').first();
  if ((await startBtn.count()) === 0) {
    await shot(adminPage, "no-start-button");
    throw new Error('"Spieltag starten" button not found — roster may be invalid');
  }
  await Promise.all([
    adminPage.waitForResponse((r) => r.url().includes("/start") && r.request().method() === "POST", { timeout: 15000 }).catch(() => null),
    startBtn.click(),
  ]);
  await adminPage.waitForLoadState("domcontentloaded");
  await adminPage.waitForTimeout(400);
  log("Admin started game day");
}

async function getMatches(page) {
  // Returns array of { matchNumber, t1A, t1B, t2A, t2B, hasScore, t1Score, t2Score }
  await page.waitForSelector('text=Match 1', { timeout: 10000 }).catch(() => null);
  const cards = page.locator('div.rounded-xl').filter({ hasText: /Match \d+/ });
  const n = await cards.count();
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = cards.nth(i);
    const header = await c.locator('text=/Match \\d+/').first().textContent();
    const m = header && header.match(/Match (\d+)/);
    if (!m) continue;
    const matchNumber = parseInt(m[1], 10);
    const teamLabels = await c.locator('div.truncate').allTextContents();
    const scores = await c.locator("span.tabular-nums").allTextContents();
    out.push({
      matchNumber,
      teamA: teamLabels[0] || "",
      teamB: teamLabels[1] || "",
      scoreA: (scores[0] || "").trim(),
      scoreB: (scores[1] || "").trim(),
      hasScore: !((scores[0] || "").trim() === "–" || (scores[1] || "").trim() === "–"),
    });
  }
  return out;
}

async function enterScore(page, matchNumber, scoreA, scoreB) {
  const card = page.locator('div.rounded-xl').filter({ hasText: new RegExp(`Match ${matchNumber}( |·|$)`) }).first();
  // Click "Tap zum Eintragen" or "✎ bearbeiten" — both inside the card
  const editBtn = card.locator('button:has-text("Tap zum Eintragen"), button:has-text("bearbeiten")').first();
  await editBtn.click();
  await page.waitForTimeout(150);

  // Now there are two steppers; first is Team A, second Team B
  const aPlus = card.locator('button[aria-label="Team A Score erhöhen"], button:has-text("+")').first();
  // Fallback: stepper "+" buttons. Check stepper.tsx
  // We need explicit targeting. Look for aria labels.
  const t1Inc = card.locator('[aria-label*="Team A"][aria-label*="erhöhen"], [aria-label*="Team A"][aria-label*="ncrease"]');
  const t1Dec = card.locator('[aria-label*="Team A"][aria-label*="verringern"], [aria-label*="Team A"][aria-label*="decrease"]');
  const t2Inc = card.locator('[aria-label*="Team B"][aria-label*="erhöhen"], [aria-label*="Team B"][aria-label*="ncrease"]');
  const t2Dec = card.locator('[aria-label*="Team B"][aria-label*="verringern"], [aria-label*="Team B"][aria-label*="decrease"]');

  // If aria labels don't match, fall back to the two pairs of "+" / "−" buttons.
  let t1IncBtn = (await t1Inc.count()) ? t1Inc.first() : null;
  let t1DecBtn = (await t1Dec.count()) ? t1Dec.first() : null;
  let t2IncBtn = (await t2Inc.count()) ? t2Inc.first() : null;
  let t2DecBtn = (await t2Dec.count()) ? t2Dec.first() : null;
  if (!t1IncBtn) {
    const pluses = card.locator('button:has-text("+")');
    const minuses = card.locator('button:has-text("−"), button:has-text("-")');
    t1DecBtn = minuses.nth(0);
    t1IncBtn = pluses.nth(0);
    t2DecBtn = minuses.nth(1);
    t2IncBtn = pluses.nth(1);
  }

  // Stepper starts at 0 — click + scoreA times, then for B + scoreB times.
  for (let i = 0; i < scoreA; i++) {
    await t1IncBtn.click();
    await page.waitForTimeout(30);
  }
  for (let i = 0; i < scoreB; i++) {
    await t2IncBtn.click();
    await page.waitForTimeout(30);
  }

  // Save
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/matches/") && r.request().method() === "PUT", { timeout: 10000 }).catch(() => null),
    card.locator('button:has-text("Speichern")').click(),
  ]);
  await page.waitForLoadState("domcontentloaded");
  if (resp && !resp.ok()) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Score save failed: ${resp.status()} ${body.slice(0, 200)}`);
  }
}

async function readScore(page, matchNumber) {
  const card = page.locator('div.rounded-xl').filter({ hasText: new RegExp(`Match ${matchNumber}( |·|$)`) }).first();
  const scores = await card.locator("span.tabular-nums").allTextContents();
  return { a: (scores[0] || "").trim(), b: (scores[1] || "").trim() };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const userPages = {}; // key -> { context, page }

  try {
    // 1. Log in everyone in parallel
    log("Logging in 6 users in parallel...");
    const loginResults = await Promise.all(
      USERS.map(async (u) => {
        const ctx = await browser.newContext({
          viewport: u.viewport,
          isMobile: !!u.mobile,
          hasTouch: !!u.mobile,
          userAgent: u.mobile
            ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            : undefined,
        });
        try {
          const page = await login(ctx, u);
          return { user: u, context: ctx, page, ok: true };
        } catch (err) {
          record("critical", "login-failed", { user: u.key, error: err.message });
          return { user: u, context: ctx, ok: false, error: err.message };
        }
      }),
    );
    for (const r of loginResults) {
      if (!r.ok) continue;
      userPages[r.user.key] = { context: r.context, page: r.page, user: r.user };
    }
    if (!userPages.admin) {
      throw new Error("Admin login failed — cannot proceed");
    }
    log("Login phase done");

    // 2. Admin creates and starts game-day
    await adminCreateAndStartDay(userPages.admin.page);
    await shot(userPages.admin.page, "admin-after-start");

    // 3. Everyone navigates to /game-day in parallel
    log("Navigating all users to /game-day");
    await Promise.all(
      Object.values(userPages).map(async ({ page, user }) => {
        await page.goto(`${BASE}/game-day`);
        await page.waitForLoadState("domcontentloaded");
        const ok = await ensureNotOnLogin(page, "after-goto-game-day", user.key);
        if (!ok) return;
        // Verify schedule is rendered
        const matchCount = await page.locator('text=/Match \\d+/').count();
        if (matchCount === 0) {
          await shot(page, `no-matches-${user.key}`);
          record("critical", "schedule-missing", { user: user.key, url: page.url() });
        } else {
          log(`${user.key}: sees ${matchCount} matches`);
        }
      }),
    );

    const adminPage = userPages.admin.page;
    const annaPage = userPages.anna?.page;
    const benPage = userPages.ben?.page;
    const claraPage = userPages.clara?.page;
    const danielPage = userPages.daniel?.page;
    const evaPage = userPages.eva?.page;

    // 4. Get the schedule from admin
    const matches = await getMatches(adminPage);
    log(`Schedule has ${matches.length} matches`, matches.map((m) => `M${m.matchNumber}:${m.teamA} vs ${m.teamB}`));
    if (matches.length === 0) {
      record("critical", "empty-schedule", { detail: "No matches generated" });
    }

    // 5. Score-entry round-robin with SSE verification
    log("Starting score-entry round-robin with SSE checks");
    // Give SSE connections a moment to establish across all observers.
    await adminPage.waitForTimeout(4000);
    // For each match, pick a participating player to enter the score, then
    // verify another user (admin) sees it appear.
    const scorers = [annaPage, benPage, claraPage, danielPage, evaPage].filter(Boolean);
    let sseFailures = 0;
    let sseSuccesses = 0;
    // For M1 (the very first score), check ALL non-scorer users to see if
    // anyone receives the live update — this exposes the
    // roster_locked → in_progress subscription gap.
    const m1ObserverState = { checked: false, observers: {} };
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const scorer = scorers[i % scorers.length];
      const observer = adminPage; // we'll observe on admin tab
      const scorerKey = USERS.find(
        (u) => userPages[u.key]?.page === scorer,
      )?.key;
      log(`Match ${m.matchNumber}: ${scorerKey} enters score, admin observes`);

      // Snapshot observer state BEFORE
      const before = await readScore(observer, m.matchNumber);

      // Score values: must sum to 3 in 5+ player "sum-to-3" format, no ties.
      const variants = [
        [3, 0], [0, 3], [2, 1], [1, 2],
      ];
      const [sA, sB] = variants[i % variants.length];
      try {
        await enterScore(scorer, m.matchNumber, sA, sB);
      } catch (err) {
        record("critical", "score-entry-failed", {
          match: m.matchNumber,
          scorer: scorerKey,
          error: err.message,
        });
        await shot(scorer, `score-entry-fail-m${m.matchNumber}`);
        continue;
      }

      // Wait up to 10s for observer to reflect the new score (without reload).
      const deadline = Date.now() + 10000;
      let after = before;
      while (Date.now() < deadline) {
        await observer.waitForTimeout(250);
        after = await readScore(observer, m.matchNumber);
        if (after.a === String(sA) && after.b === String(sB)) break;
      }
      // For M1, additionally probe every other user
      if (i === 0) {
        await adminPage.waitForTimeout(2000); // ensure all observers had a chance
        for (const [uk, info] of Object.entries(userPages)) {
          if (info.page === scorer) continue;
          if (info.page.isClosed()) continue;
          try {
            const s = await readScore(info.page, m.matchNumber);
            m1ObserverState.observers[uk] = `${s.a}:${s.b}`;
          } catch {
            m1ObserverState.observers[uk] = "(error)";
          }
        }
        m1ObserverState.checked = true;
        log("M1 live-state across observers:", m1ObserverState.observers);
      }

      if (after.a === String(sA) && after.b === String(sB)) {
        sseSuccesses++;
        log(`  SSE OK: admin sees ${after.a}:${after.b}`);
      } else {
        sseFailures++;
        // After the deadline, do one more reload to confirm the score is in
        // the DB but just not pushed live to admin.
        let scoreInDb = null;
        try {
          await observer.reload({ waitUntil: "domcontentloaded" });
          await observer.waitForTimeout(500);
          scoreInDb = await readScore(observer, m.matchNumber);
        } catch {}
        record("important", "sse-update-missing", {
          match: m.matchNumber,
          expected: `${sA}:${sB}`,
          observed_live: `${after.a}:${after.b}`,
          score_after_reload: scoreInDb ? `${scoreInDb.a}:${scoreInDb.b}` : "n/a",
          observer: "admin",
        });
        await shot(observer, `sse-miss-m${m.matchNumber}`);
      }
    }
    log(`SSE results: ${sseSuccesses}/${matches.length} matches updated live`);
    if (m1ObserverState.checked) {
      const observersWithoutScore = Object.entries(m1ObserverState.observers)
        .filter(([, v]) => v.includes("–"))
        .map(([k]) => k);
      if (observersWithoutScore.length > 0) {
        record("critical", "first-score-not-broadcast", {
          observed: m1ObserverState.observers,
          missing: observersWithoutScore,
          hypothesis:
            "GameDayLiveUpdates only mounts when day.status === 'in_progress'. The very first score is what flips status from roster_locked to in_progress. Until then, no client has subscribed to the SSE stream, so the publish for the first score is delivered to zero subscribers. Subsequent scores work because router.refresh() on the scorer remounts <GameDayLiveUpdates/>, but other users only re-subscribe once they themselves trigger a navigation/refresh.",
        });
      }
    }

    // 6. Cross-tab persistence test for Anna
    if (annaPage) {
      log("Cross-tab persistence test: Anna opens 2nd tab, navigates, refreshes");
      const annaCtx = userPages.anna.context;
      const tab2 = await annaCtx.newPage();
      attachDiagnostics("anna-tab2", tab2);
      // The /game-day page keeps an SSE connection alive, so networkidle
      // never fires there. Use domcontentloaded throughout.
      await tab2.goto(`${BASE}/ranking`, { waitUntil: "domcontentloaded" });
      await ensureNotOnLogin(tab2, "anna-tab2-ranking", "anna");
      await tab2.goto(`${BASE}/game-day`, { waitUntil: "domcontentloaded" });
      await ensureNotOnLogin(tab2, "anna-tab2-gameday", "anna");
      await tab2.reload({ waitUntil: "domcontentloaded" });
      await ensureNotOnLogin(tab2, "anna-tab2-after-reload", "anna");
      await tab2.close();
    }

    // 7. Idle test for Ben (~60s)
    if (benPage) {
      log("Idle test: Ben idles 60s on /game-day, then clicks");
      await benPage.bringToFront();
      const idleStart = Date.now();
      await benPage.waitForTimeout(60_000);
      log(`Idle elapsed: ${Date.now() - idleStart}ms`);
      // Click any match's edit button (or just refresh)
      const benFirstEdit = benPage.locator('button:has-text("bearbeiten"), button:has-text("Tap zum Eintragen")').first();
      if ((await benFirstEdit.count()) > 0) {
        await benFirstEdit.click();
        await benPage.waitForTimeout(500);
        await ensureNotOnLogin(benPage, "ben-after-idle-click", "ben");
        // Cancel the edit so we don't accidentally save anything
        const cancel = benPage.locator('button:has-text("Abbrechen")').first();
        if ((await cancel.count()) > 0) await cancel.click();
      } else {
        await benPage.reload();
        await benPage.waitForLoadState("domcontentloaded");
        await ensureNotOnLogin(benPage, "ben-after-idle-reload", "ben");
      }
    }

    // 8. Extra match by Clara
    if (claraPage) {
      log("Extra match: Clara adds extra match");
      const beforeCount = (await getMatches(claraPage)).length;
      const addBtn = claraPage.locator('button:has-text("Zusatz-Match")').first();
      if ((await addBtn.count()) === 0) {
        record("important", "extra-match-button-missing", {
          user: "clara",
          note: "No '+ Zusatz-Match' button visible to confirmed player",
        });
        await shot(claraPage, "no-extra-match-button");
      } else {
        const [resp] = await Promise.all([
          claraPage.waitForResponse(
            (r) => r.url().includes("/matches") && r.request().method() === "POST",
            { timeout: 10000 },
          ).catch(() => null),
          addBtn.click(),
        ]);
        if (resp) {
          log(`Extra-match POST status: ${resp.status()}`);
          if (!resp.ok()) {
            const body = await resp.text().catch(() => "");
            record("important", "extra-match-api-error", {
              status: resp.status(),
              body: body.slice(0, 200),
            });
          }
        }
        // Force reload to ensure refreshed RSC view
        await claraPage.reload({ waitUntil: "domcontentloaded" });
        await claraPage.waitForTimeout(800);
        const afterCount = (await getMatches(claraPage)).length;
        if (afterCount <= beforeCount) {
          record("critical", "extra-match-not-added", { before: beforeCount, after: afterCount });
        } else {
          // Verify other observers see it live (extend deadline to 6s
          // since the new match also requires the RSC re-render on admin).
          const adminCount0 = (await getMatches(adminPage)).length;
          const deadline = Date.now() + 6000;
          let adminCount = adminCount0;
          while (Date.now() < deadline && adminCount < afterCount) {
            await adminPage.waitForTimeout(300);
            adminCount = (await getMatches(adminPage)).length;
          }
          if (adminCount < afterCount) {
            record("important", "extra-match-not-live", {
              expected: afterCount,
              observed: adminCount,
            });
            await shot(adminPage, "extra-match-not-live-admin");
          } else {
            log(`Extra match live on admin: now sees ${adminCount}`);
          }
        }
      }
    }

    // 9. Joker test: try from a player view
    if (annaPage) {
      log("Joker probe: looking for joker UI on a player's game-day view");
      await annaPage.goto(`${BASE}/game-day`);
      await annaPage.waitForLoadState("domcontentloaded");
      const jokerBtn = annaPage.locator('button:has-text("Joker")').first();
      const cnt = await jokerBtn.count();
      if (cnt === 0) {
        record("info", "joker-not-in-player-view", {
          note: "No joker action surfaced on /game-day for confirmed players (joker is admin-managed in /admin pre-roster-lock).",
        });
      } else {
        log(`Joker UI element found (count=${cnt}) — may be a label, not actionable.`);
      }
    }

    // 11. Optimistic-locking probe: Eva and Daniel try to edit the same match
    if (evaPage && danielPage) {
      log("Optimistic-locking probe: Eva and Daniel both edit a scored match");
      const ms2 = await getMatches(evaPage);
      // Pick a match where we can still flip the score and remain valid
      // (sum to 3, no ties). Score "2:1" → "1:2" works.
      const scored = ms2.find((m) => (m.scoreA === "2" && m.scoreB === "1") || (m.scoreA === "1" && m.scoreB === "2"));
      if (scored) {
        const evaCard = evaPage.locator('div.rounded-xl').filter({ hasText: new RegExp(`Match ${scored.matchNumber}( |·|$)`) }).first();
        const danCard = danielPage.locator('div.rounded-xl').filter({ hasText: new RegExp(`Match ${scored.matchNumber}( |·|$)`) }).first();
        await evaCard.locator('button:has-text("bearbeiten")').click().catch(() => null);
        await danCard.locator('button:has-text("bearbeiten")').click().catch(() => null);
        await evaPage.waitForTimeout(300);
        await danielPage.waitForTimeout(300);

        // The two steppers are inside `[role="group"]` with aria-label "Team A Score" / "Team B Score"
        // and contain "Wert verringern" / "Wert erhöhen" buttons.
        const evaT1Dec = evaCard.locator('[aria-label="Team A Score"] button[aria-label="Wert verringern"]');
        const evaT2Inc = evaCard.locator('[aria-label="Team B Score"] button[aria-label="Wert erhöhen"]');
        // Eva flips: 2:1 → 1:2 (or 1:2 → 0:3 if base is 1:2)
        if ((await evaT1Dec.count()) > 0) await evaT1Dec.first().click();
        if ((await evaT2Inc.count()) > 0) await evaT2Inc.first().click();
        await Promise.all([
          evaPage.waitForResponse((r) => r.url().includes("/api/matches/") && r.request().method() === "PUT", { timeout: 5000 }).catch(() => null),
          evaCard.locator('button:has-text("Speichern")').click().catch(() => null),
        ]);
        await evaPage.waitForTimeout(500);

        // Daniel saves with stale version — should get 409
        const respPromise = danielPage.waitForResponse(
          (r) => r.url().includes("/api/matches/") && r.request().method() === "PUT",
          { timeout: 5000 },
        ).catch(() => null);
        await danCard.locator('button:has-text("Speichern")').click().catch(() => null);
        const resp = await respPromise;
        if (resp) {
          if (resp.status() === 409) {
            log("Optimistic-locking returned 409 as expected");
            const errVisible = await danCard.locator("text=Zwischenzeitlich geändert").count();
            if (errVisible === 0) {
              record("nit", "conflict-error-message-missing", {
                note: "Got 409 but 'Zwischenzeitlich geändert – Seite neu laden' was not visible on Daniel's card",
              });
            }
          } else if (resp.status() === 200) {
            // SSE refreshed Daniel's view before he saved, bumping his
            // expectedVersion. Healthy outcome — note it.
            record("info", "optimistic-conflict-prevented-by-sse", {
              status: 200,
              note: "SSE update propagated to Daniel before he clicked Save, so version matched. Conflict path could not be triggered in this run.",
            });
          } else {
            record("important", "unexpected-save-status", {
              status: resp.status(),
              note: "Expected 409 or 200; got something else",
            });
          }
        } else {
          record("important", "no-response-on-conflict-save", {});
        }
        // Cleanup: cancel Daniel's editor
        await danCard.locator('button:has-text("Abbrechen")').click().catch(() => null);
      }
    }

    // 12. Score edge cases: try to enter both 0:0 (should that be allowed?)
    // The Stepper min=0 max=12, so technically allowed. Skip — just note.
    record("info", "score-edge-case-validation", {
      note: "Stepper enforces 0..maxScore; no UI prevents 0:0 ties. Verify backend rules match expectations.",
    });

    // 13. Fill any remaining unscored matches so we can finish the day
    log("Filling all remaining unscored matches via admin");
    const allMatches = await getMatches(adminPage);
    for (const m of allMatches) {
      if (!m.hasScore) {
        await enterScore(adminPage, m.matchNumber, 2, 1).catch((e) =>
          record("important", "fill-score-failed", { match: m.matchNumber, error: e.message }),
        );
      }
    }
    await adminPage.waitForLoadState("domcontentloaded");
    await adminPage.waitForTimeout(500);

    // 14. Finish game day
    log("Admin finishing game day");
    const finishBtn = adminPage.locator('button:has-text("Spieltag abschließen")').first();
    let finishedOk = false;
    if ((await finishBtn.count()) === 0) {
      // FinishBanner only shows when ALL matches are scored. Re-check by
      // refreshing once.
      await adminPage.reload();
      await adminPage.waitForLoadState("domcontentloaded");
    }
    const finishBtn2 = adminPage.locator('button:has-text("Spieltag abschließen")').first();
    if ((await finishBtn2.count()) === 0) {
      await shot(adminPage, "no-finish-button");
      record("critical", "finish-button-missing", {
        note: "After all scores entered, no 'Spieltag abschließen' button visible on admin view",
      });
    } else {
      await Promise.all([
        adminPage.waitForResponse(
          (r) => r.url().includes("/finish") && r.request().method() === "POST",
          { timeout: 10000 },
        ).catch(() => null),
        finishBtn2.click(),
      ]);
      await adminPage.waitForLoadState("domcontentloaded");
      finishedOk = true;
      await shot(adminPage, "admin-after-finish");
    }

    // 15. Verify other users see finished state and ranking
    if (finishedOk) {
      log("Verifying ranking + archive across users");
      await Promise.all(
        Object.values(userPages).map(async ({ page, user }) => {
          if (page.isClosed()) return;
          await page.goto(`${BASE}/ranking`);
          await page.waitForLoadState("domcontentloaded");
          await ensureNotOnLogin(page, "ranking-after-finish", user.key);
        }),
      );
      await adminPage.goto(`${BASE}/archive`);
      await adminPage.waitForLoadState("domcontentloaded");
      await shot(adminPage, "archive-list");
    }

    // 16. Logout / re-login cycle for Eva
    if (evaPage) {
      log("Logout/re-login cycle for Eva");
      // Logout lives in the avatar dropdown ("Benutzermenü").
      await evaPage.goto(`${BASE}/`);
      await evaPage.waitForLoadState("domcontentloaded");
      // Two menus render in DOM (desktop + mobile); pick the visible one.
      const userMenuBtn = evaPage
        .locator('button[aria-label="Benutzermenü"]:visible')
        .first();
      if ((await userMenuBtn.count()) > 0) {
        await userMenuBtn.click();
        await evaPage.waitForTimeout(200);
        const logoutBtn = evaPage.locator('button[role="menuitem"]:has-text("Abmelden")').first();
        if ((await logoutBtn.count()) > 0) {
          await logoutBtn.click().catch(() => null);
          await evaPage.waitForTimeout(1500);
        } else {
          record("nit", "logout-menuitem-missing", { user: "eva" });
          const ctx = userPages.eva.context;
          await ctx.clearCookies();
        }
      } else {
        record("important", "user-menu-button-missing", { user: "eva" });
        const ctx = userPages.eva.context;
        await ctx.clearCookies();
      }
      await evaPage.goto(`${BASE}/game-day`);
      await evaPage.waitForLoadState("domcontentloaded");
      const onLogin = evaPage.url().includes("/login");
      if (!onLogin) {
        record("important", "logout-did-not-clear-session", {
          finalUrl: evaPage.url(),
        });
      } else {
        // Re-login. The login form does window.location.assign("/") which
        // can race with our wait — be defensive.
        try {
          await evaPage.locator("#identifier").fill("eva@demo.local");
          await evaPage.locator("#password").fill(DEMO_PASSWORD);
          await evaPage.locator('button[type="submit"]').click();
          await evaPage.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
          await evaPage.waitForTimeout(800);
          if (evaPage.url().includes("/login")) {
            await shot(evaPage, "relogin-failed");
            record("critical", "relogin-failed", { user: "eva", url: evaPage.url() });
          } else {
            log(`Eva re-login OK, now at ${evaPage.url()}`);
          }
        } catch (err) {
          // Aborted goto from window.location.assign is acceptable.
          if (!/ERR_ABORTED/.test(err.message)) {
            record("critical", "relogin-error", { user: "eva", error: err.message });
          } else {
            log(`Eva re-login redirect navigation aborted (acceptable), final url: ${evaPage.url()}`);
          }
        }
      }
    }

    // 17. InstallHint check on iPhone-sized contexts (Ben, Eva)
    for (const key of ["ben", "eva"]) {
      const userp = userPages[key];
      if (!userp) continue;
      const p = userp.page;
      if (p.isClosed()) continue;
      await p.goto(`${BASE}/`);
      await p.waitForLoadState("domcontentloaded");
      const banner = p.locator('[aria-label="App auf dem Home-Bildschirm hinzufügen"]');
      const visible = await banner.count();
      log(`${key}: install banner present=${visible}`);
      if (visible > 0) {
        // Verify dismiss persistence
        await banner.locator('button[aria-label="Hinweis schließen"]').click().catch(() => null);
        await p.waitForTimeout(300);
        const stillThere = await p.locator('[aria-label="App auf dem Home-Bildschirm hinzufügen"]').count();
        if (stillThere > 0) {
          record("important", "install-hint-not-dismissed", { user: key });
        }
        await p.reload();
        await p.waitForLoadState("domcontentloaded");
        const reappeared = await p.locator('[aria-label="App auf dem Home-Bildschirm hinzufügen"]').count();
        if (reappeared > 0) {
          record("important", "install-hint-reappears-after-dismiss", { user: key });
        }
      }
    }

    // 18. Console errors flush
    for (const [k, errs] of consoleErrors.entries()) {
      if (errs.length > 0) {
        record("nit", "console-issues", { user: k, count: errs.length, sample: errs.slice(0, 5) });
      }
    }
  } catch (err) {
    record("critical", "test-runner-crash", { error: err.message, stack: err.stack });
  } finally {
    await writeFile(
      path.join(ART, "findings.json"),
      JSON.stringify(findings, null, 2),
      "utf8",
    );
    log(`Findings written: ${findings.length} entries`);
    // Close browser
    await browser.close();
  }
}

main().then(() => {
  // eslint-disable-next-line no-console
  console.log("[e2e] DONE");
  process.exit(0);
}).catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[e2e] FATAL", e);
  process.exit(1);
});
