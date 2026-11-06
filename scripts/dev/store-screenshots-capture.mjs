// Nimmt die Rohscreenshots auf (Server auf BASE, Daten aus seed-store-screenshots.ts).
import { chromium, devices } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = path.resolve("docs/app-store/screenshots/raw");
const EMAIL = "markus.kramer@padelmaestro.example";
const PASSWORD = "Padel-Screens-2026";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 440, height: 956 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  colorScheme: "dark",
  userAgent: UA,
  locale: "de-DE",
  timezoneId: "Europe/Berlin",
});
const page = await ctx.newPage();

async function settle() {
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {}); // SSE hält die Verbindung offen
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
}
async function shot(name, { fullPage = false } = {}) {
  await settle();
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
  console.log("raw", name);
}

await page.goto(`${BASE}/login/email`);
await page.fill("#identifier", EMAIL);
await page.fill("#password", PASSWORD);
await page.click("button[type=submit]");
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });

await page.goto(BASE + "/");
await settle();
// Safari-Hinweis "Zum Home-Bildschirm" wegklicken
await page.getByRole("button", { name: "Hinweis schließen" }).click({ timeout: 3000 }).catch(() => {});
await shot("01-home");

await page.goto(`${BASE}/game-day`);
await settle();
// 2:0 ist bei Summe 3 noch kein gültiges Ergebnis und wird nicht gespeichert
const mine = page.getByRole("button", { name: /^Punkt für .+ hinzufügen$/ }).first();
await mine.click();
await mine.click();
await shot("02-court");

await page.goto(`${BASE}/ranking`);
await shot("03-tabelle");
await page.goto(`${BASE}/ranking?ansicht=verlauf`);
await shot("04-verlauf");

// Share-Bild des letzten abgeschlossenen Spieltags
await page.goto(`${BASE}/archive`);
await settle();
const href = await page.locator('a[href^="/archive/"]').first().getAttribute("href");
const dayId = href.split("/").pop();
const res = await ctx.request.get(`${BASE}/api/game-days/${dayId}/share-image`);
if (!res.ok()) throw new Error(`share-image ${res.status()}`);
await writeFile(path.join(OUT, "05-share.png"), await res.body());
console.log("raw 05-share");

await page.goto(`${BASE}/admin/spieltage`);
await shot("06-verwaltung");

await browser.close();
