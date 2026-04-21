import { createHash, randomBytes } from "node:crypto";

export function generateSeed(): string {
  return randomBytes(16).toString("base64url");
}

// Mulberry32-style PRNG seeded via SHA-256 of the seed string,
// used to drive a Fisher–Yates shuffle.
export function seededShuffle<T>(input: readonly T[], seed: string): T[] {
  const result = input.slice();
  const rng = prngFromSeed(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function prngFromSeed(seed: string): () => number {
  const hash = createHash("sha256").update(seed).digest();
  let state = hash.readUInt32BE(0) || 1;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
