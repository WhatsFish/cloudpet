// Visual QA for hat alignment: composites each hat onto representative creatures/stages at the
// SAME translate the client uses (contact row B → head-top anchorY), upscales, and tiles into one
// montage PNG so a human (or Claude via Read) can eyeball that every hat sits on the head.
// Run: node scripts/gen-deco-qa.mjs  → docs/review/deco-qa.png

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canvas, encode, renderBuf, headAnchor, W, H } from "./gen-art.mjs";
import { HATS, HAT_BASE, HAT_DROP } from "./gen-deco.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// composite a hat buffer onto a sprite buffer, shifted so contact row B lands on head-top y
function withHat(sprite, hatId, anchorY) {
  const out = sprite.slice();
  if (!hatId) return out;
  const hb = canvas(); HATS[hatId](hb);
  const dy = anchorY - HAT_BASE + HAT_DROP;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = hb[(y * W + x) * 4 + 3]; if (!a) continue;
    const ty = y + dy; if (ty < 0 || ty >= H) continue;
    const di = (ty * W + x) * 4, si = (y * W + x) * 4;
    const af = a / 255;
    for (let k = 0; k < 3; k++) out[di + k] = Math.round(hb[si + k] * af + out[di + k] * (1 - af));
    out[di + 3] = Math.max(out[di + 3], a);
  }
  return out;
}

const ROWS = [
  ["puff", "true", "child"], ["claude", "true", "adult"], ["blocky", "true", "baby"],
  ["penguin", "true", "child"], ["bear", "true", "teen"], ["seal", "true", "adult"],
  ["penguin", "emperor", "teen"], ["bear", "panda", "adult"],
];
const COLS = [null, "beanie", "straw", "crown", "party", "flower", "bow", "wizard"];
const SC = 3, GAP = 2;
const TW = W * SC, TH = H * SC;
const MW = COLS.length * TW + (COLS.length + 1) * GAP;
const MH = ROWS.length * TH + (ROWS.length + 1) * GAP;
const mont = new Uint8ClampedArray(MW * MH * 4);
// light checker bg so transparent areas + alignment read clearly
for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { const c = ((x >> 3) + (y >> 3)) & 1 ? 238 : 250; const i = (y * MW + x) * 4; mont[i] = mont[i + 1] = mont[i + 2] = c; mont[i + 3] = 255; }

function blit(buf, ox, oy) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = buf[(y * W + x) * 4 + 3]; if (!a) continue;
    const af = a / 255;
    for (let sy = 0; sy < SC; sy++) for (let sx = 0; sx < SC; sx++) {
      const X = ox + x * SC + sx, Y = oy + y * SC + sy; if (X < 0 || Y < 0 || X >= MW || Y >= MH) continue;
      const di = (Y * MW + X) * 4, si = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) mont[di + k] = Math.round(buf[si + k] * af + mont[di + k] * (1 - af));
    }
  }
}

ROWS.forEach(([line, variant, stage], r) => {
  const sprite = renderBuf(line, variant, stage, "idle");
  const aY = headAnchor(line, variant, stage).y;
  COLS.forEach((hatId, c) => {
    const composed = withHat(sprite, hatId, aY);
    blit(composed, GAP + c * (TW + GAP), GAP + r * (TH + GAP));
  });
});

mkdirSync(join(ROOT, "docs/review"), { recursive: true });
writeFileSync(join(ROOT, "docs/review/deco-qa.png"), encode(mont, MW, MH));
console.log(`montage ${MW}x${MH} → docs/review/deco-qa.png (rows=creatures, cols: none + ${COLS.filter(Boolean).join(", ")})`);
