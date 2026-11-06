// Regression check for sporadic React hydration error #418 on "/".
// A proxy in front of the app delivers the HTML document in small, delayed chunks, so the async
// bootstrap scripts hydrate while later Flight rows are still in transit. Any page error fails the run.
//
//   E2E_BASE_URL=http://localhost:3000 E2E_EMAIL=... E2E_PASSWORD=... node tests/e2e/hydration-stream.mjs
//   (optional: E2E_PAGES=/,/ranking)
import http from "node:http";
import { chromium } from "playwright";

const UPSTREAM = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000");
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const PAGES = (process.env.E2E_PAGES ?? "/").split(",");
const CHUNK = 3000;
const DELAY_MS = 4;
const ROUNDS = 4;

if (!EMAIL || !PASSWORD) {
  console.error("set E2E_EMAIL and E2E_PASSWORD");
  process.exit(2);
}

function startSlowProxy() {
  const server = http.createServer((req, res) => {
    const headers = { ...req.headers, host: UPSTREAM.host, "accept-encoding": "identity" };
    const up = http.request(
      { host: UPSTREAM.hostname, port: UPSTREAM.port, path: req.url, method: req.method, headers },
      (ur) => {
        const isHtml = String(ur.headers["content-type"] ?? "").includes("text/html");
        if (!isHtml) {
          res.writeHead(ur.statusCode ?? 200, ur.headers);
          ur.pipe(res);
          return;
        }
        const parts = [];
        ur.on("data", (c) => parts.push(c));
        ur.on("end", () => {
          const body = Buffer.concat(parts);
          const outHeaders = { ...ur.headers };
          delete outHeaders["content-length"];
          res.writeHead(ur.statusCode ?? 200, outHeaders);
          let offset = 0;
          const next = () => {
            if (offset >= body.length) return res.end();
            res.write(body.subarray(offset, offset + CHUNK));
            offset += CHUNK;
            setTimeout(next, DELAY_MS);
          };
          next();
        });
      },
    );
    req.pipe(up);
    up.on("error", () => res.destroy());
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const proxy = await startSlowProxy();
const base = `http://127.0.0.1:${proxy.address().port}`;
const browser = await chromium.launch();
const errors = [];
try {
  const page = await (await browser.newContext()).newPage();
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message.slice(0, 160)}`));
  await page.goto(`${base}/login/email`);
  await page.locator("#identifier").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  for (const path of PAGES) {
    for (let i = 0; i < ROUNDS; i++) {
      await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
    }
  }
} finally {
  await browser.close();
  proxy.close();
}

if (errors.length > 0) {
  console.error(`FAIL: ${errors.length} page error(s) while streaming`);
  for (const e of errors) console.error(" ", e);
  process.exit(1);
}
console.log(`OK: no hydration errors on ${PAGES.join(", ")} (${ROUNDS} loads each)`);
