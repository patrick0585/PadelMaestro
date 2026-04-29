#!/usr/bin/env node
// One-shot generator: rasterizes src/app/icon.svg into the PNG sizes
// the PWA install flow expects on iOS (apple-icon.png, 180×180) and
// Android (manifest icons, 192×192 + 512×512). Re-run if the SVG ever
// changes; otherwise the committed PNGs stay valid.

import { readFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Maskable icons must keep all artwork inside an 80 % "safe zone" so
// the OS can crop up to 10 % off any edge without clipping the logo.
const MASKABLE_SAFE_ZONE = 0.8;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const svgPath = resolve(repoRoot, "src/app/icon.svg");

const targets = [
  { out: "public/icons/icon-192.png", size: 192 },
  { out: "public/icons/icon-512.png", size: 512 },
  { out: "public/icons/maskable-512.png", size: 512, padded: true },
  { out: "src/app/apple-icon.png", size: 180 },
];

async function main() {
  const svg = await readFile(svgPath);

  for (const { out, size, padded } of targets) {
    const absOut = resolve(repoRoot, out);
    await mkdir(dirname(absOut), { recursive: true });

    if (padded) {
      const inner = Math.round(size * MASKABLE_SAFE_ZONE);
      const innerPng = await sharp(svg, { density: 384 })
        .resize(inner, inner)
        .png()
        .toBuffer();
      await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 0x0b, g: 0x12, b: 0x20, alpha: 1 },
        },
      })
        .composite([{ input: innerPng, gravity: "center" }])
        .png()
        .toFile(absOut);
    } else {
      await sharp(svg, { density: 384 }).resize(size, size).png().toFile(absOut);
    }

    const bytes = (await readFile(absOut)).byteLength;
    console.log(`wrote ${out}  ${size}×${size}  (${bytes} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
