// Shared helpers for the Playwright drivers in tests/e2e.

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const ART = path.resolve("tests/e2e/artifacts");
if (!existsSync(ART)) await mkdir(ART, { recursive: true });

export const findings = [];
export const consoleErrors = new Map(); // key -> array of msgs

export const log = (...args) => {
  // eslint-disable-next-line no-console
  console.log("[e2e]", ...args);
};

export function record(level, code, detail) {
  const entry = { level, code, detail, t: new Date().toISOString() };
  findings.push(entry);
  log(`${level.toUpperCase()} ${code}:`, detail);
}

export async function writeFindings(file = "findings.json") {
  await writeFile(path.join(ART, file), JSON.stringify(findings, null, 2), "utf8");
  log(`Findings written: ${findings.length} entries`);
}

export async function shot(page, name) {
  const p = path.join(ART, `${name}.png`);
  try {
    await page.screenshot({ path: p, fullPage: true });
  } catch (err) {
    log("screenshot failed", name, err.message);
  }
  return p;
}

export function attachDiagnostics(key, page) {
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

export async function login(context, user) {
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

export async function ensureNotOnLogin(page, label, userKey) {
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

export function plusDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Creates a planned game day on /admin (or reuses an open one) and waits for
// the participant roster. Returns the created date, or null when reused.
export async function adminCreateDay(adminPage) {
  await adminPage.goto(`${BASE}/admin`);
  await adminPage.waitForLoadState("domcontentloaded");

  // If a day is already in_progress, /game-day shows it but /admin only shows
  // planned/in_progress days. We may already have a manageable day.
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
  return createdDate;
}

// Confirms players by clicking the "→" arrow on each pool card. Use xpath to
// scope to the right card.
export async function adminConfirmPlayers(adminPage, playerNames) {
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
}

export async function adminStartDay(adminPage) {
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

export async function adminCreateAndStartDay(
  adminPage,
  playerNames = ["Anna", "Ben", "Clara", "Daniel", "Eva"],
) {
  await adminCreateDay(adminPage);
  await adminConfirmPlayers(adminPage, playerNames);
  await adminStartDay(adminPage);
}

export async function getMatches(page) {
  // Returns array of { matchNumber, teamA, teamB, scoreA, scoreB, hasScore }
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

export async function enterScore(page, matchNumber, scoreA, scoreB) {
  const card = page.locator('div.rounded-xl').filter({ hasText: new RegExp(`Match ${matchNumber}( |·|$)`) }).first();
  // Click "Tap zum Eintragen" or "✎ bearbeiten" — both inside the card
  const editBtn = card.locator('button:has-text("Tap zum Eintragen"), button:has-text("bearbeiten")').first();
  await editBtn.click();
  await page.waitForTimeout(150);

  // Two steppers in the card — first Team A, second Team B. We try
  // explicit aria targeting first, with a positional fallback below.
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

export async function readScore(page, matchNumber) {
  const card = page.locator('div.rounded-xl').filter({ hasText: new RegExp(`Match ${matchNumber}( |·|$)`) }).first();
  const scores = await card.locator("span.tabular-nums").allTextContents();
  return { a: (scores[0] || "").trim(), b: (scores[1] || "").trim() };
}
