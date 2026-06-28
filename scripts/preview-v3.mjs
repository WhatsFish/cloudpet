#!/usr/bin/env node
// V3 preview: render the REAL post-adult sprites (成熟体 / 觉醒体 / 三气) with the art engine
// and write them as PNGs for the design review page (web/public/v3-preview/). This does NOT
// touch the production pet assets — it only renders preview frames so @WhatsFish can see the
// actual pixels the engine produces for the new evolution stages.
//
// Usage: node scripts/preview-v3.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderBuf, encode, LINES, W, H } from "./gen-art.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "web/public/v3-preview");
mkdirSync(OUT, { recursive: true });

// upscale a 64x64 rgba buffer ×k with nearest-neighbour, encode to PNG
function upscale(buf, k) {
  const w = W * k, h = H * k;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = (x / k) | 0, sy = (y / k) | 0;
    const si = (sy * W + sx) * 4, di = (y * w + x) * 4;
    out[di] = buf[si]; out[di + 1] = buf[si + 1]; out[di + 2] = buf[si + 2]; out[di + 3] = buf[si + 3];
  }
  return encode(Buffer.from(out.buffer), w, h);
}

// columns: each is [stage, qi]
const COLS = [
  ["adult", null, "adult"],
  ["mature", null, "mature"],
  ["awakened", null, "awaken"],
  ["awakened", "flame", "flame"],
  ["awakened", "frost", "frost"],
  ["awakened", "radiant", "radiant"],
];

const K = 4; // 64 -> 256
let n = 0;
for (const lineId of Object.keys(LINES)) {
  for (const [stage, qi, tag] of COLS) {
    const buf = renderBuf(lineId, "true", stage, "idle", qi);
    writeFileSync(join(OUT, `${lineId}_${tag}.png`), upscale(buf, K));
    n++;
  }
}
console.log(`wrote ${n} preview PNGs to ${OUT}`);
