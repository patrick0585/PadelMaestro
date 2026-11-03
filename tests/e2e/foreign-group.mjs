// End-to-end run "fremde Gruppe": a stranger founds a group from a founder
// link, invites people, and plays a game day through — without operator help
// beyond creating the founder link. One browser context per person.
//
// Needs a dev server whose AUTH_URL/APP_URL match E2E_BASE_URL, and the demo
// players from `pnpm seed:demo` (anna@demo.local in group padelmaestro).

import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  BASE,
  findings,
  consoleErrors,
  record,
  log,
  shot,
  attachDiagnostics,
  login,
  ensureNotOnLogin,
  adminCreateDay,
  adminStartDay,
  getMatches,
  enterScore,
  writeFindings,
} from "./lib.mjs";

const TS = Date.now().toString(36);
const GROUP_NAME = `E2E Runde ${TS}`;
const OLD_GROUP_NAME = "Padelmaestro";
const PASSWORD = `pw-${TS}`;
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// Signup is rate-limited per client IP (5/h). Each person gets its own
// forwarded IP per run, as strangers on their own phones would have.
const NET = `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
const PEOPLE = {
  founder: { key: "founder", name: `Greta ${TS}`, email: `gruender-${TS}@e2e.local`, ip: `${NET}.1` },
  m1: { key: "m1", name: `Mats ${TS}`, email: `mitglied1-${TS}@e2e.local`, ip: `${NET}.2`, mobile: true },
  m2: { key: "m2", name: `Mila ${TS}`, email: `mitglied2-${TS}@e2e.local`, ip: `${NET}.3` },
  anna: { key: "anna", name: "Anna", email: "anna@demo.local", password: "demo12345", ip: `${NET}.4` },
};

const timings = [];
async function step(label, fn) {
  const t0 = Date.now();
  log(`--- ${label}`);
  try {
    return await fn();
  } finally {
    timings.push({ step: label, ms: Date.now() - t0 });
  }
}

class StepFailed extends Error {}
// Records a critical finding and aborts the run: later steps depend on it.
async function fail(page, code, detail) {
  if (page) await shot(page, `foreign-${code}`);
  record("critical", code, detail);
  throw new StepFailed(code);
}

function createFounderLink() {
  const tsx = path.resolve("node_modules/.bin/tsx");
  const args = existsSync(".env") ? ["--env-file=.env"] : [];
  const out = execFileSync(tsx, [...args, "scripts/invite-founder.ts", "--note", `E2E ${TS}`], {
    env: { ...process.env, APP_URL: BASE },
    encoding: "utf8",
  });
  const url = out.match(/https?:\/\/\S+\/einladung\/\S+/)?.[0];
  if (!url) throw new Error(`no founder link in output: ${out}`);
  return url;
}

async function newContext(browser, person) {
  return browser.newContext({
    viewport: person.mobile ? { width: 375, height: 812 } : { width: 1280, height: 800 },
    isMobile: !!person.mobile,
    hasTouch: !!person.mobile,
    userAgent: person.mobile ? IPHONE_UA : undefined,
    extraHTTPHeaders: { "x-forwarded-for": person.ip },
  });
}

// Dev builds hydrate late; typing into a controlled input or clicking a button
// before React has attached its handlers is silently lost.
async function hydrated(locator) {
  const el = locator.first();
  await el.waitFor({ timeout: 15000 });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const ok = await el.evaluate((node) => Object.keys(node).some((k) => k.startsWith("__reactProps")));
    if (ok) return el;
    await el.page().waitForTimeout(100);
  }
  throw new Error("element never hydrated");
}

async function signUp(context, person, link) {
  const page = await context.newPage();
  attachDiagnostics(person.key, page);
  await page.goto(link, { waitUntil: "domcontentloaded" });
  await hydrated(page.locator("#signup-name"));
  await page.locator("#signup-name").fill(person.name);
  await page.locator("#signup-email").fill(person.email);
  await page.locator("#signup-password").fill(PASSWORD);
  await page.locator("#signup-terms").check();
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/signup"), { timeout: 15000 }).catch(() => null),
    page.getByRole("button", { name: "Konto anlegen" }).click(),
  ]);
  if (!resp || resp.status() !== 201) {
    const body = resp ? await resp.text().catch(() => "") : "no response";
    await fail(page, "signup-failed", { user: person.key, status: resp?.status(), body: body.slice(0, 200) });
  }
  return page;
}

// The switcher renders in both the desktop and the mobile bar; take the visible one.
async function switcherState(page) {
  const trigger = page.locator('button[aria-haspopup="menu"]:visible', { hasText: "Gruppe wechseln" }).first();
  if ((await trigger.count()) === 0) {
    const single = await page.locator("header span[title]:visible").first().textContent().catch(() => null);
    return { trigger: null, groups: single ? [single.trim()] : [], active: single?.trim() ?? null };
  }
  await hydrated(trigger);
  await trigger.click();
  const items = page.locator('[role="menu"][aria-label="Gruppen"]:visible [role="menuitemradio"]');
  await items.first().waitFor({ timeout: 5000 });
  const groups = (await items.allTextContents()).map((t) => t.trim());
  const active = (await page
    .locator('[role="menu"][aria-label="Gruppen"]:visible [role="menuitemradio"][aria-checked="true"]')
    .textContent())?.trim() ?? null;
  await page.keyboard.press("Escape");
  return { trigger, groups, active };
}

async function rankingNames(page) {
  await page.goto(`${BASE}/ranking`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Rangliste" }).waitFor({ timeout: 10000 });
  const list = page.getByRole("list", { name: "Rangliste" });
  if ((await list.count()) === 0) return [];
  return (await list.locator("li div.truncate").allTextContents()).map((t) => t.trim());
}

function sameSet(a, b) {
  return a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const pages = {};
  let annaHomeGroupId = null;
  const started = Date.now();

  try {
    // a. Founder link from the operator CLI.
    const founderLink = await step("a. Gründer-Link erzeugen", () => createFounderLink());
    log("Founder link:", founderLink);
    if (!founderLink.startsWith(BASE)) {
      record("important", "founder-link-wrong-origin", { link: founderLink, expected: BASE });
    }

    // b. Founder signs up and founds the group.
    await step("b. Gründer: Registrierung + Gruppe", async () => {
      const ctx = await newContext(browser, PEOPLE.founder);
      const page = await signUp(ctx, PEOPLE.founder, founderLink);
      pages.founder = page;
      await page.waitForURL((u) => u.pathname === "/gruppe/neu", { timeout: 15000 }).catch(() => null);
      if (new URL(page.url()).pathname !== "/gruppe/neu") {
        await fail(page, "founder-not-on-gruppe-neu", { url: page.url() });
      }
      await hydrated(page.locator("#group-name"));
      await page.locator("#group-name").fill(GROUP_NAME);
      await Promise.all([
        page.waitForURL((u) => u.pathname === "/admin", { timeout: 15000 }).catch(() => null),
        page.getByRole("button", { name: "Gruppe gründen" }).click(),
      ]);
      const url = new URL(page.url());
      if (url.pathname !== "/admin" || url.searchParams.get("willkommen") !== "1") {
        await fail(page, "founder-not-on-admin-welcome", { url: page.url() });
      }
      const welcome = page.getByText("Deine Gruppe steht. Lade jetzt deine Mitspieler ein.");
      if (!(await welcome.isVisible().catch(() => false))) {
        await fail(page, "welcome-message-missing", { url: page.url() });
      }
    });

    // c. Founder creates a member link.
    const memberLink = await step("c. Mitglieder-Link erstellen", async () => {
      const page = pages.founder;
      await hydrated(page.locator("#invitation-note"));
      await page.locator("#invitation-note").fill("E2E Mitglieder");
      await page.getByRole("button", { name: "Einladungslink erstellen" }).click();
      const input = page.getByRole("textbox", { name: "Einladungslink" });
      await input.waitFor({ timeout: 10000 }).catch(() => null);
      const url = await input.inputValue().catch(() => "");
      if (!/\/einladung\/\S+/.test(url)) await fail(page, "member-link-missing", { value: url });
      if (!url.startsWith(BASE)) record("important", "member-link-wrong-origin", { link: url, expected: BASE });
      return url;
    });
    log("Member link:", memberLink);

    // d. Two strangers sign up through the member link.
    await step("d. Zwei Beitritte per Registrierung", async () => {
      for (const p of [PEOPLE.m1, PEOPLE.m2]) {
        const ctx = await newContext(browser, p);
        const page = await signUp(ctx, p, memberLink);
        pages[p.key] = page;
        await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 }).catch(() => null);
        if (!(await ensureNotOnLogin(page, "after-member-signup", p.key))) throw new StepFailed("login");
        if (new URL(page.url()).pathname !== "/") {
          await fail(page, "member-not-on-dashboard", { user: p.key, url: page.url() });
        }
        const sw = await switcherState(page);
        if (sw.active !== GROUP_NAME || sw.groups.length !== 1) {
          await fail(page, "member-wrong-group", { user: p.key, switcher: { groups: sw.groups, active: sw.active } });
        }
      }
    });

    // e. Existing account (anna, padelmaestro) joins via the member link.
    await step("e. Bestehendes Konto tritt bei", async () => {
      const ctx = await newContext(browser, PEOPLE.anna);
      const page = await login(ctx, PEOPLE.anna);
      pages.anna = page;
      annaHomeGroupId = await page.evaluate(async () => {
        const res = await fetch("/api/auth/session");
        return (await res.json())?.user?.groupId ?? null;
      });
      if (!annaHomeGroupId) record("info", "anna-home-group-unknown", { note: "cannot restore her active group" });
      await page.goto(memberLink, { waitUntil: "domcontentloaded" });
      const join = page.getByRole("button", { name: `Gruppe ${GROUP_NAME} beitreten` });
      if ((await join.count()) === 0) await fail(page, "join-button-missing", { url: page.url() });
      await hydrated(join);
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith("/api/invitations/join"), { timeout: 15000 }).catch(() => null),
        join.click(),
      ]);
      if (resp?.status() !== 200) await fail(page, "join-failed", { status: resp?.status() });
      await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 }).catch(() => null);
      await page.waitForLoadState("domcontentloaded");
      const sw = await switcherState(page);
      log("anna switcher:", sw.groups, "active:", sw.active);
      if (!sw.groups.includes(GROUP_NAME) || !sw.groups.includes(OLD_GROUP_NAME)) {
        await fail(page, "anna-switcher-groups", { groups: sw.groups });
      }
      if (sw.groups.length !== 2) {
        record("info", "anna-has-extra-groups", { groups: sw.groups, note: "left over from earlier runs" });
      }
      if (sw.active !== GROUP_NAME) {
        await fail(page, "anna-new-group-not-active", { active: sw.active, expected: GROUP_NAME });
      }
    });

    const players = [PEOPLE.founder, PEOPLE.m1, PEOPLE.m2, PEOPLE.anna];
    const playerNames = players.map((p) => p.name);

    // f. Game day: create, everyone confirms, start, scores, finish.
    await step("f1. Spieltag anlegen", async () => {
      await adminCreateDay(pages.founder);
      const pool = pages.founder.locator('button[aria-label="Zu Dabei verschieben"]');
      const poolCount = await pool.count();
      if (poolCount !== 4) record("important", "roster-pool-size", { expected: 4, actual: poolCount });
    });

    await step("f2. Teilnehmer sagen zu", async () => {
      for (const p of players) {
        const page = pages[p.key];
        await page.goto(`${BASE}/game-day`, { waitUntil: "domcontentloaded" });
        const btn = page.getByRole("button", { name: "Dabei", exact: true });
        if ((await btn.count()) === 0) await fail(page, "attendance-button-missing", { user: p.key });
        await hydrated(btn);
        const [resp] = await Promise.all([
          page.waitForResponse((r) => r.url().endsWith("/attendance") && r.request().method() === "POST", { timeout: 10000 }).catch(() => null),
          btn.click(),
        ]);
        if (!resp?.ok()) await fail(page, "attendance-failed", { user: p.key, status: resp?.status() });
        await page.getByText("Dabei ✓").waitFor({ timeout: 10000 }).catch(() => null);
      }
      await pages.anna.reload({ waitUntil: "domcontentloaded" });
      if ((await pages.anna.getByText("4 / 4 bestätigt").count()) === 0) {
        await fail(pages.anna, "not-all-confirmed", { expected: "4 / 4 bestätigt" });
      }
    });

    await step("f3. Spieltag starten", async () => {
      const page = pages.founder;
      await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
      await hydrated(page.locator('button:has-text("Spieltag starten")'));
      await adminStartDay(page);
      await page.goto(`${BASE}/game-day`, { waitUntil: "domcontentloaded" });
      if ((await page.getByText(/Match 1 · Vorschau/i).count()) > 0) {
        await fail(page, "day-not-started", { url: page.url() });
      }
    });

    const matches = await step("f4. Ergebnisse eintragen", async () => {
      for (const p of players) {
        await pages[p.key].goto(`${BASE}/game-day`, { waitUntil: "domcontentloaded" });
      }
      const ms = await getMatches(pages.founder);
      log(`Schedule: ${ms.length} matches`, ms.map((m) => `M${m.matchNumber}: ${m.teamA} vs ${m.teamB}`));
      if (ms.length !== 3) record("critical", "unexpected-match-count", { expected: 3, actual: ms.length });
      const scores = [[6, 3], [4, 6], [6, 2]];
      const scorers = [pages.m1, pages.anna, pages.m2];
      for (let i = 0; i < ms.length; i++) {
        const [a, b] = scores[i % scores.length];
        const scorer = scorers[i % scorers.length];
        try {
          await hydrated(scorer.locator('button:has-text("Tap zum Eintragen"), button:has-text("bearbeiten")'));
          await enterScore(scorer, ms[i].matchNumber, a, b);
        } catch (err) {
          await shot(scorer, `foreign-score-m${ms[i].matchNumber}`);
          record("critical", "score-entry-failed", { match: ms[i].matchNumber, error: err.message });
        }
      }
      return ms;
    });

    await step("f5. Spieltag abschließen", async () => {
      const page = pages.founder;
      await page.reload({ waitUntil: "domcontentloaded" });
      const after = await getMatches(page);
      const unscored = after.filter((m) => !m.hasScore).map((m) => m.matchNumber);
      if (unscored.length > 0) await fail(page, "matches-unscored", { unscored });
      const finish = page.getByRole("button", { name: "Spieltag abschließen" });
      if ((await finish.count()) === 0) await fail(page, "finish-button-missing", {});
      await hydrated(finish);
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.url().includes("/finish") && r.request().method() === "POST", { timeout: 15000 }).catch(() => null),
        finish.click(),
      ]);
      if (!resp?.ok()) await fail(page, "finish-failed", { status: resp?.status() });
      log(`Finished day with ${matches.length} matches`);
    });

    await step("f6. Rangliste der neuen Gruppe", async () => {
      const names = await rankingNames(pages.founder);
      log("Founder ranking:", names);
      if (!sameSet(names, playerNames)) {
        await fail(pages.founder, "ranking-players-mismatch", { expected: playerNames, actual: names });
      }
    });

    // g. Isolation between the groups.
    await step("g. Isolation", async () => {
      const page = pages.anna;
      const names = await rankingNames(page);
      log("Anna ranking (new group):", names);
      if (!sameSet(names, playerNames)) {
        await fail(page, "anna-ranking-leaks", { expected: playerNames, actual: names });
      }

      const sw = await switcherState(page);
      if (!sw.trigger) await fail(page, "switcher-missing", { groups: sw.groups });
      await sw.trigger.click();
      const oldItem = page.locator('[role="menu"][aria-label="Gruppen"]:visible [role="menuitemradio"]', { hasText: OLD_GROUP_NAME });
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith("/api/profile/active-group"), { timeout: 10000 }).catch(() => null),
        oldItem.click(),
      ]);
      if (resp?.status() !== 204) await fail(page, "switch-back-failed", { status: resp?.status() });
      const back = await rankingNames(page);
      const swBack = await switcherState(page);
      log("Anna ranking (padelmaestro):", back, "active:", swBack.active);
      if (swBack.active !== OLD_GROUP_NAME) {
        await fail(page, "switch-back-not-active", { active: swBack.active });
      }
      const leaked = back.filter((n) => playerNames.includes(n) && n !== "Anna");
      if (leaked.length > 0) await fail(page, "old-ranking-shows-new-players", { leaked });

      // The strangers must not see padelmaestro data at all.
      const m1Names = await rankingNames(pages.m1);
      if (!sameSet(m1Names, playerNames)) {
        await fail(pages.m1, "member-ranking-mismatch", { expected: playerNames, actual: m1Names });
      }
    });
  } catch (err) {
    if (!(err instanceof StepFailed)) {
      record("critical", "test-runner-crash", { error: err.message, stack: err.stack });
      for (const [key, page] of Object.entries(pages)) await shot(page, `foreign-crash-${key}`);
    }
  } finally {
    // Leave anna in padelmaestro even when the run aborted before step g.
    if (pages.anna && annaHomeGroupId) {
      try {
        const status = await pages.anna.evaluate(async (groupId) => {
          const res = await fetch("/api/profile/active-group", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ groupId }),
          });
          return res.status;
        }, annaHomeGroupId);
        if (status !== 204) record("info", "anna-restore-failed", { status });
      } catch (err) {
        record("info", "anna-restore-failed", { error: err.message });
      }
    }
    for (const [k, errs] of consoleErrors.entries()) {
      const hard = errs.filter((e) => !e.startsWith("[warning]"));
      const warnings = errs.filter((e) => e.startsWith("[warning]"));
      if (hard.length > 0) record("critical", "console-errors", { user: k, count: hard.length, sample: hard.slice(0, 5) });
      if (warnings.length > 0) record("nit", "console-warnings", { user: k, count: warnings.length, sample: warnings.slice(0, 5) });
    }
    await writeFindings("foreign-findings.json");
    await browser.close();
  }

  const critical = findings.filter((f) => f.level === "critical");
  log("Timings:", timings.map((t) => `${t.step} ${(t.ms / 1000).toFixed(1)}s`).join(" | "));
  log(`Total ${((Date.now() - started) / 1000).toFixed(1)}s, group "${GROUP_NAME}"`);
  log(`Summary: ${findings.length} findings, ${critical.length} critical`);
  return critical.length;
}

main().then((critical) => {
  // eslint-disable-next-line no-console
  console.log(critical > 0 ? "[e2e] FAILED" : "[e2e] DONE");
  process.exit(critical > 0 ? 1 : 0);
}).catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[e2e] FATAL", e);
  process.exit(1);
});
