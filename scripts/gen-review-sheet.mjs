#!/usr/bin/env node
// QA montage: composite one line's evolution at 5x so the morphology is judgeable.
// Layout per line:  row1 = trunk (baby, child) · row2 = teen fork (true, feed, engage, tend)
// · row3 = adult fork (same order).  Writes docs/review/<line>.png. Usage: node scripts/gen-review-sheet.mjs
import { renderBuf, encode, LINES, W, H } from "./gen-art.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/review");
mkdirSync(OUT, { recursive: true });
const S = 5, PAD = 10, COLS = 4, BG = [244, 242, 238];

function sheet(lineId) {
  const line = LINES[lineId];
  const branches = Object.values(line.branches); // feed, engage, tend
  const cell = W * S;
  const rows = [
    [["true", "baby"], ["true", "child"]],
    [["true", "teen"], ...branches.map((b) => [b.variant, "teen"])],
    [["true", "adult"], ...branches.map((b) => [b.variant, "adult"])],
  ];
  const bigW = COLS * cell + (COLS + 1) * PAD;
  const bigH = rows.length * cell + (rows.length + 1) * PAD;
  const big = new Uint8ClampedArray(bigW * bigH * 4);
  for (let i = 0; i < bigW * bigH; i++) { big[i * 4] = BG[0]; big[i * 4 + 1] = BG[1]; big[i * 4 + 2] = BG[2]; big[i * 4 + 3] = 255; }
  rows.forEach((row, r) => {
    row.forEach((cellSpec, c) => {
      const [variant, stage] = cellSpec;
      const buf = renderBuf(lineId, variant, stage, "idle");
      const ox = PAD + c * (cell + PAD), oy = PAD + r * (cell + PAD);
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
        const sx = (x / S) | 0, sy = (y / S) | 0, si = (sy * W + sx) * 4;
        if (buf[si + 3] === 0) continue;
        const di = ((oy + y) * bigW + (ox + x)) * 4;
        big[di] = buf[si]; big[di + 1] = buf[si + 1]; big[di + 2] = buf[si + 2]; big[di + 3] = 255;
      }
    });
  });
  writeFileSync(join(OUT, `${lineId}.png`), encode(big, bigW, bigH));
  return `${lineId}.png ${bigW}x${bigH} (cols: trunk… | true feed engage tend)`;
}

for (const id of Object.keys(LINES)) console.log(sheet(id));
