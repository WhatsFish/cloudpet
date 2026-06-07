#!/usr/bin/env node
// QA montage: one big PNG laying out every creature × [stages | moods | acts] so the whole
// roster can be eyeballed against the designer sheets in a single Read. Not shipped.
// Usage: node scripts/gen-qa.mjs > /tmp/qa.png  (or it writes /tmp/cloudpet-qa.png)
import { renderBuf, encode, LINES } from "./gen-art.mjs";
import { writeFileSync } from "node:fs";

const S = 64, PAD = 2, SCALE = 2;
const ROWS = Object.keys(LINES); // 5 creatures
// columns: [stage sprites] + [moods at teen] + [acts at teen]
const COLS = [
  ["egg", "egg", "idle"], ["baby", "baby", "idle"], ["child", "child", "idle"], ["teen", "teen", "idle"], ["adult", "adult", "idle"],
  ["happy", "teen", "happy"], ["sad", "teen", "sad"], ["sleeping", "teen", "sleeping"], ["sulk", "teen", "sulk"], ["eating", "teen", "eating"], ["hide", "teen", "hide"],
  ["feed", "teen", "feed"], ["clean", "teen", "clean"], ["play", "teen", "play"],
];
const cols = COLS.length, rows = ROWS.length;
const cw = S + PAD, ch = S + PAD;
const W = cols * cw + PAD, Hh = rows * ch + PAD;
const out = new Uint8ClampedArray(W * Hh * 4);
// neutral cool-gray bg so white/cream creatures stay visible
for (let i = 0; i < W * Hh; i++) { out[i * 4] = 226; out[i * 4 + 1] = 230; out[i * 4 + 2] = 236; out[i * 4 + 3] = 255; }
function blit(buf, ox, oy) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const a = buf[(y * S + x) * 4 + 3]; if (!a) continue;
    const t = a / 255, X = ox + x, Y = oy + y, di = (Y * W + X) * 4, si = (y * S + x) * 4;
    for (let k = 0; k < 3; k++) out[di + k] = Math.round(buf[si + k] * t + out[di + k] * (1 - t));
  }
}
ROWS.forEach((line, r) => {
  COLS.forEach(([, stage, mood], c) => {
    blit(renderBuf(line, "true", stage, mood), PAD + c * cw, PAD + r * ch);
  });
});
// nearest-neighbour upscale
const W2 = W * SCALE, H2 = Hh * SCALE, big = new Uint8ClampedArray(W2 * H2 * 4);
for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
  const si = ((y / SCALE | 0) * W + (x / SCALE | 0)) * 4, di = (y * W2 + x) * 4;
  for (let k = 0; k < 4; k++) big[di + k] = out[si + k];
}
writeFileSync("/tmp/cloudpet-qa.png", encode(big, W2, H2));
console.log(`/tmp/cloudpet-qa.png ${W2}x${H2} — rows: ${ROWS.join(", ")}`);
console.log(`cols: ${COLS.map((c) => c[0]).join(" | ")}`);
