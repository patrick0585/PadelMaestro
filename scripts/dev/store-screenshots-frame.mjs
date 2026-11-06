// Rahmt die Rohscreenshots (docs/app-store/screenshots/raw) zu 1320x2868-Store-Bildern.
import { chromium } from "playwright";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DIR = path.resolve("docs/app-store/screenshots");
const FONT = pathToFileURL(path.resolve("assets/fonts/BarlowCondensed-ExtraBold.ttf")).href;

// [..] markiert das Schlüsselwort in Limette
const SHOTS = [
  ["01-home", "01-home.png", "Deine Runde [auf einen Blick]"],
  ["02-court", "02-court.png", "Punkte [direkt am Platz] zählen"],
  ["03-tabelle", "03-tabelle.png", "Die Saison-Tabelle, [immer aktuell]"],
  ["04-verlauf", "04-verlauf.png", "Wer [steigt auf], wer fällt?"],
  ["05-share", "05-share.png", "Euer Spieltag [als Bild]"],
  ["06-verwaltung", "06-verwaltung.png", "Spieltage [in Sekunden] planen"],
];

const headline = (t) =>
  t.replace(/\[(.+?)\]/g, '<span class="k">$1</span>');

const html = (text, img, share) => `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Barlow;font-weight:800;src:url("${FONT}")}
*{margin:0;box-sizing:border-box}
body{width:1320px;height:2868px;overflow:hidden;position:relative;background:#0b1220;
 background-image:radial-gradient(ellipse 900px 700px at 50% 62%,rgba(34,211,238,.22),transparent 70%),
 radial-gradient(ellipse 700px 500px at 85% 0%,rgba(34,211,238,.10),transparent 70%)}
h1{position:absolute;left:90px;right:90px;top:110px;height:260px;font:800 124px/1.04 Barlow,sans-serif;
 text-transform:uppercase;color:#fff;text-align:center;display:flex;align-items:center;justify-content:center}
.k{color:#bef264}
.slot{position:absolute;left:0;right:0;top:440px;bottom:77px;display:flex;align-items:${share ? "center" : "flex-start"};justify-content:center}
img{width:1082px;display:block;border-radius:70px;border:4px solid #253149;
 box-shadow:0 40px 120px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.03)}
</style><h1><span>${headline(text)}</span></h1><div class="slot"><img src="${img}"></div>`;

const tmp = await mkdtemp(path.join(tmpdir(), "frames-"));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1320, height: 2868 }, deviceScaleFactor: 1 });
for (const [raw, out, text] of SHOTS) {
  const file = path.join(tmp, `${raw}.html`);
  const img = pathToFileURL(path.join(DIR, "raw", `${raw}.png`)).href;
  await writeFile(file, html(text, img, raw === "05-share"));
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(DIR, out) });
  console.log("framed", out);
}
await browser.close();
await rm(tmp, { recursive: true, force: true });
