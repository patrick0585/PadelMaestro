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

// Opens the first planned game day listed under "Offen" on /admin/spieltage.
// Returns false when there is none (running days link to /game-day instead).
export async function openPlannedDay(adminPage) {
  await adminPage.goto(`${BASE}/admin/spieltage`, { waitUntil: "domcontentloaded" });
  const row = adminPage.locator('a[href^="/admin/spieltage/"]').first();
  if ((await row.count()) === 0) return false;
  await Promise.all([
    adminPage.waitForURL(/\/admin\/spieltage\/[^/]+$/, { timeout: 15000 }),
    row.click(),
  ]);
  await adminPage.waitForLoadState("domcontentloaded");
  return true;
}

// Creates a planned game day on /admin/spieltage (or opens an existing planned
// one) and waits for the participant roster on the detail page. Returns the
// created date, or null when reused.
export async function adminCreateDay(adminPage) {
  let createdDate = null;
  if (await openPlannedDay(adminPage)) {
    log("Reusing existing planned day");
  } else {
    for (let attempt = 0; attempt < 14 && !createdDate; attempt++) {
      const d = plusDaysISO(attempt);
      const dateInput = adminPage.locator("#game-day-date");
      if (!(await dateInput.isVisible())) {
        // Dev builds hydrate late: retry the toggle click until the form opens.
        const toggle = adminPage.locator('[data-testid="create-game-day"]');
        await toggle.waitFor({ timeout: 15000 });
        for (let i = 0; i < 10 && !(await dateInput.isVisible()); i++) {
          await toggle.click().catch(() => null);
          await adminPage.waitForTimeout(500);
        }
      }
      await dateInput.fill(d);
      await adminPage.locator('[data-testid="create-game-day-submit"]').click();
      const outcome = await Promise.race([
        adminPage
          .waitForURL(/\/admin\/spieltage\/[^/]+$/, { timeout: 10000 })
          .then(() => "created"),
        adminPage
          .locator("text=Für diesen Tag existiert bereits ein Spieltag")
          .first()
          .waitFor({ timeout: 10000 })
          .then(() => "exists"),
      ]).catch(() => "timeout");
      if (outcome === "created") createdDate = d;
      else if (outcome === "timeout") {
        await shot(adminPage, "create-day-timeout");
        throw new Error(`Creating game day for ${d} timed out`);
      }
    }
    if (!createdDate) throw new Error("Could not create a game day in 14 attempts");
    log("Admin created game-day for", createdDate);
  }

  // Wait for the participant roster (rendered after server refresh).
  for (let attempt = 0; attempt < 3; attempt++) {
    const ok = await adminPage
      .waitForSelector("text=Spielerpool", { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (ok) break;
    log(`Spielerpool not visible (attempt ${attempt + 1}); reloading`);
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
  const startBtn = adminPage.locator('[data-testid="start-game-day"]').first();
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
  // from the compact match rows (li[data-match-number]); collapsed rows are read too.
  await page.waitForSelector("li[data-match-number]", { timeout: 10000, state: "attached" }).catch(() => null);
  const rows = page.locator("li[data-match-number]");
  const n = await rows.count();
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    const matchNumber = parseInt((await r.getAttribute("data-match-number")) ?? "0", 10);
    const teams = await r.locator("span.truncate").allTextContents();
    const score = ((await r.locator('[data-testid="score"]').first().textContent()) ?? "").trim();
    const m = score.match(/(\d+):(\d+)/);
    out.push({
      matchNumber,
      teamA: teams[0] || "",
      teamB: teams[1] || "",
      scoreA: m ? m[1] : "–",
      scoreB: m ? m[2] : "–",
      hasScore: !!m,
    });
  }
  return out;
}

async function scoreEditorFor(page, matchNumber) {
  // The current match sits in the ticket with its editor already open.
  const hero = page.locator(`[data-testid="current-match"][data-match-number="${matchNumber}"]`);
  if (await hero.count()) return hero.first();
  const row = page.locator(`li[data-match-number="${matchNumber}"]`).first();
  // Rows may live in a collapsed <details>; open it before tapping.
  await row.evaluate((el) => {
    const d = el.closest("details");
    if (d) d.open = true;
  });
  const toggle = row.locator("button[aria-expanded]").first();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  return row;
}

export async function enterScore(page, matchNumber, scoreA, scoreB) {
  const box = await scoreEditorFor(page, matchNumber);
  const set = async (team, target) => {
    // Counters are labelled with player names; team A is the first pair, team B the second.
    const idx = team === "A" ? 0 : 1;
    const dec = box.locator('[aria-label^="Punkt für"][aria-label$="entfernen"]').nth(idx);
    const inc = box.locator('[aria-label^="Punkt für"][aria-label$="hinzufügen"]').nth(idx);
    // Editors start at the stored score when correcting; reset to 0 first.
    while (await dec.isEnabled()) {
      await dec.click();
      await page.waitForTimeout(20);
    }
    for (let i = 0; i < target; i++) {
      await inc.click();
      await page.waitForTimeout(20);
    }
  };
  await set("A", scoreA);
  await set("B", scoreB);

  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/matches/") && r.request().method() === "PUT", { timeout: 10000 }).catch(() => null),
    // Court board: "Speichert x:y" during the auto-save countdown, "Speichern · x:y" otherwise.
    box.locator('[data-testid="court-save"], button:has-text("Speichern")').first().click(),
  ]);
  await page.waitForLoadState("domcontentloaded");
  if (resp && !resp.ok()) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Score save failed: ${resp.status()} ${body.slice(0, 200)}`);
  }
}

export async function readScore(page, matchNumber) {
  const row = page.locator(`li[data-match-number="${matchNumber}"]`).first();
  const score = ((await row.locator('[data-testid="score"]').first().textContent().catch(() => "")) ?? "").trim();
  const m = score.match(/(\d+):(\d+)/);
  return { a: m ? m[1] : "–", b: m ? m[2] : "–" };
}
