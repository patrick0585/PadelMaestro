// End-to-end multi-context test for Padel Tracker.
// Drives 6 concurrent browser contexts (1 admin + 5 players) through a full
// game-day lifecycle. Captures screenshots on failures into the artifacts dir
// and emits a JSON+text findings log to stdout.

import { chromium } from "playwright";
import {
  BASE,
  record,
  log,
  shot,
  attachDiagnostics,
  login,
  ensureNotOnLogin,
  adminCreateAndStartDay,
  getMatches,
  enterScore,
  readScore,
  consoleErrors,
  writeFindings,
  currentMatchNumber,
} from "./lib.mjs";

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

function todayISO() {
  // Use tomorrow if today already exists — but we'll try today first and fall
  // back to scanning forward.
  const d = new Date();
  return d.toISOString().slice(0, 10);
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
    // For M1 (the very first score), check ALL non-scorer users to see
    // if anyone receives the live update — this is the historical
    // M1-broadcast regression guard.
    const m1ObserverState = { checked: false, observers: {} };
    for (let i = 0; i < matches.length; i++) {
      const scorer = scorers[i % scorers.length];
      // Score the running match (court card); the next one sits in its own card, not in the list.
      const cur = await currentMatchNumber(scorer);
      if (cur === null) break;
      const m = { matchNumber: cur };
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
            "GameDayLiveUpdates only mounts when day.status === 'in_progress'. The very first score is what flips status from in_progress to in_progress. Until then, no client has subscribed to the SSE stream, so the publish for the first score is delivered to zero subscribers. Subsequent scores work because router.refresh() on the scorer remounts <GameDayLiveUpdates/>, but other users only re-subscribe once they themselves trigger a navigation/refresh.",
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

    // 10. Optimistic locking: a stale version must get 409, and of two simultaneous saves exactly one wins.
    if (evaPage && danielPage) {
      log("Optimistic-locking probe: Eva corrects a match, Daniel saves stale, then both save at once");
      await evaPage.goto(`${BASE}/game-day`, { waitUntil: "domcontentloaded" });
      const scored = (await getMatches(evaPage)).find((m) => m.hasScore);
      if (!scored) {
        record("important", "conflict-probe-no-scored-match", {});
      } else {
        const reqP = evaPage.waitForRequest((r) => r.url().includes("/api/matches/") && r.method() === "PUT", { timeout: 15000 });
        const flip = scored.scoreA === "3" ? [0, 3] : [3, 0];
        await enterScore(evaPage, scored.matchNumber, flip[0], flip[1]);
        const req = await reqP;
        const url = new URL(req.url()).pathname;
        const sent = JSON.parse(req.postData() ?? "{}");
        await danielPage.goto(`${BASE}/game-day`, { waitUntil: "domcontentloaded" });
        const put = (page, version, a, b) =>
          page.evaluate(
            async ({ url, version, a, b }) =>
              (await fetch(url, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ team1Score: a, team2Score: b, expectedVersion: version }),
              })).status,
            { url, version, a, b },
          );
        const stale = await put(danielPage, sent.expectedVersion, 2, 1);
        if (stale !== 409) record("critical", "stale-version-accepted", { status: stale });
        else log("Stale version rejected with 409");
        const next = sent.expectedVersion + 1;
        const both = (await Promise.all([put(evaPage, next, 2, 1), put(danielPage, next, 1, 2)])).sort();
        if (both[0] !== 200 || both[1] !== 409) record("critical", "concurrent-save-not-exclusive", { statuses: both });
        else log("Simultaneous saves: one 200, one 409");
      }
    }

    // 11. Score edge cases: try to enter both 0:0 (should that be allowed?)
    // The Stepper min=0 max=12, so technically allowed. Skip — just note.
    record("info", "score-edge-case-validation", {
      note: "Stepper enforces 0..maxScore; no UI prevents 0:0 ties. Verify backend rules match expectations.",
    });

    // 12. Fill any remaining unscored matches so we can finish the day
    log("Filling all remaining unscored matches via admin");
    // The court card always shows the first unscored match; score it until none is left.
    for (let guard = 0; guard < 30; guard++) {
      await adminPage.goto(`${BASE}/game-day`, { waitUntil: "domcontentloaded" });
      const n = await currentMatchNumber(adminPage);
      if (n === null) break;
      const ok = await enterScore(adminPage, n, 2, 1).then(
        () => true,
        (e) => (record("important", "fill-score-failed", { match: n, error: e.message }), false),
      );
      if (!ok) break;
      await adminPage.waitForTimeout(300);
    }
    await adminPage.waitForLoadState("domcontentloaded");
    await adminPage.waitForTimeout(500);

    // 13. Finish game day
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

    // 14. Verify other users see finished state and ranking
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

    // 15. Logout / re-login cycle for Eva
    if (evaPage) {
      log("Logout/re-login cycle for Eva");
      // Logout lives in the profile's account list (the avatar links straight to /profil).
      await evaPage.goto(`${BASE}/profil`);
      await evaPage.waitForLoadState("domcontentloaded");
      const logoutBtn = evaPage.getByRole("button", { name: "Abmelden" }).first();
      if ((await logoutBtn.count()) > 0) {
        await Promise.all([
          evaPage.waitForURL((u) => u.pathname.startsWith("/login"), { timeout: 15000 }).catch(() => null),
          logoutBtn.click(),
        ]);
      } else {
        record("important", "logout-button-missing", { user: "eva" });
        await userPages.eva.context.clearCookies();
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
          const evaUser = USERS.find((u) => u.key === "eva");
          await evaPage.locator("#identifier").fill(evaUser.email);
          await evaPage.locator("#password").fill(evaUser.password);
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

    // 16. InstallHint check on iPhone-sized contexts (Ben, Eva)
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

    // 17. Console errors flush
    for (const [k, errs] of consoleErrors.entries()) {
      if (errs.length > 0) {
        record("nit", "console-issues", { user: k, count: errs.length, sample: errs.slice(0, 5) });
      }
    }
  } catch (err) {
    record("critical", "test-runner-crash", { error: err.message, stack: err.stack });
  } finally {
    await writeFindings("findings.json");
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
