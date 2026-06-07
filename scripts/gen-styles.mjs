#!/usr/bin/env node
// Art-direction EXPLORATION (not the shipped art). Four candidate DESIGN LANGUAGES for
// a cuter, simpler, derpy (蠢萌) pet, each demonstrating the 6 asks: 简单 / 蠢萌 / 可成长
// / 可进化 / 可变形 / 可装饰. Flat fills + a bold outline + BIG silly eyes — deliberately
// simpler than the current cel-shaded roster. Renders a labeled design sheet per scheme
// to web/public/styles/<scheme>.png for the /cloudpet/styles review page.
// Usage: node scripts/gen-styles.mjs

import { encode } from "./gen-art.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "web/public/styles");
mkdirSync(OUT, { recursive: true });
const W = 64, H = 64;

const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function canvas() { return new Uint8ClampedArray(W * H * 4); }
function px(b, x, y, c, a = 255) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; b[i] = c[0]; b[i + 1] = c[1]; b[i + 2] = c[2]; b[i + 3] = a; }
const getA = (b, x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : b[(y * W + x) * 4 + 3];
function disc(b, cx, cy, r, c) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) px(b, cx + dx, cy + dy, c); }
function ell(b, cx, cy, rx, ry, c) { for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) px(b, cx + dx, cy + dy, c); }
function rrect(b, cx, cy, hw, hh, rad, c) { for (let dy = -hh; dy <= hh; dy++) for (let dx = -hw; dx <= hw; dx++) { const ox = Math.max(0, Math.abs(dx) - (hw - rad)), oy = Math.max(0, Math.abs(dy) - (hh - rad)); if (ox * ox + oy * oy <= rad * rad) px(b, cx + dx, cy + dy, c); } }
function tri(b, ax, ay, bx, by, cx, cy, c) { const mnx = Math.min(ax, bx, cx), mxx = Math.max(ax, bx, cx), mny = Math.min(ay, by, cy), mxy = Math.max(ay, by, cy); for (let y = mny; y <= mxy; y++) for (let x = mnx; x <= mxx; x++) { const w0 = (bx - ax) * (y - ay) - (by - ay) * (x - ax), w1 = (cx - bx) * (y - by) - (cy - by) * (x - bx), w2 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx); if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) px(b, x, y, c); } }
function stroke(b, x0, y0, x1, y1, r, c) { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0))); for (let i = 0; i <= n; i++) { const cx = x0 + (x1 - x0) * i / n, cy = y0 + (y1 - y0) * i / n; disc(b, cx, cy, r, c); } }
function outline(b, col, th = 1) {
  for (let pass = 0; pass < th; pass++) {
    const mask = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mask[y * W + x] = getA(b, x, y) > 0 ? 1 : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (mask[y * W + x]) continue; if (mask[y * W + x - 1] || mask[y * W + x + 1] || (y > 0 && mask[(y - 1) * W + x]) || (y < H - 1 && mask[(y + 1) * W + x])) px(b, x, y, col); }
  }
}
function shadow(b, cy, rx) { for (let dy = -2; dy <= 2; dy++) for (let dx = -rx; dx <= rx; dx++) if ((dx * dx) / (rx * rx) + (dy * dy) / 4 <= 1) px(b, 32 + dx, cy + dy, [0, 0, 0], 30); }
// BIG silly eyes — the cuteness lever. look = pupil offset; size scales with the face.
function eyes(b, cx, cy, sp, r, ink, look = [0, 1], mood = "idle") {
  const lx = cx - sp, rx = cx + sp;
  if (mood === "happy") { for (const ex of [lx, rx]) { px(b, ex - 2, cy, ink); px(b, ex - 1, cy - 1, ink); px(b, ex, cy - 2, ink); px(b, ex + 1, cy - 1, ink); px(b, ex + 2, cy, ink); } return; }
  for (const ex of [lx, rx]) {
    disc(b, ex, cy, r, [255, 255, 255]);
    const dpr = Math.max(2, r - 2);
    disc(b, ex + look[0], cy + look[1], dpr, ink);
    px(b, ex + look[0] - 1, cy + look[1] - 1, [255, 255, 255]);
    px(b, ex + look[0] - 1, cy + look[1] - 2, [255, 255, 255]);
  }
}
function blush(b, cx, cy, sp, c) { for (const ex of [cx - sp, cx + sp]) { ell(b, ex, cy, 2, 1, c); } }
function deco(b, kind, topY, pal) {
  if (kind === "hat") { tri(b, 32, topY - 9, 32 - 7, topY + 1, 32 + 7, topY + 1, pal.deco); rrect(b, 32, topY + 2, 9, 2, 1, [255, 255, 255]); px(b, 32, topY - 9, [255, 240, 150]); }
  else if (kind === "bow") { tri(b, 32, topY, 32 - 6, topY - 3, 32 - 6, topY + 3, pal.deco); tri(b, 32, topY, 32 + 6, topY - 3, 32 + 6, topY + 3, pal.deco); disc(b, 32, topY, 2, [255, 255, 255]); }
  else if (kind === "leaf") { stroke(b, 32, topY + 2, 32, topY - 6, 1, [120, 160, 80]); ell(b, 33, topY - 6, 3, 2, [130, 200, 110]); }
}

// =================== SCHEMES ===================
// Each draw(b, { stage:1..3, variant, mood, deco }, pal). stage scales size + features.
const SCHEMES = {
  // A — 奶团 (Chiikawa-ish puff): the round head IS the body; huge eyes, tiny mouth, blush.
  puff: {
    name: "奶团", tag: "Chiikawa 风 · 大头小身软团子",
    pal: { body: hx("#FBE3C8"), deco: hx("#F2A0B4"), ink: hx("#6A5A6E"), cheek: hx("#F6AEBE") },
    variants: ["base", "ears", "horn"],
    draw(b, s, pal) {
      const sc = [0, 0.72, 0.86, 1][s.stage], r = Math.round(16 * sc), cy = 38 - Math.round(r * 0.1);
      if (s.variant === "ears") { disc(b, 32 - r + 3, cy - r + 2, 4, pal.body); disc(b, 32 + r - 3, cy - r + 2, 4, pal.body); }
      if (s.variant === "horn") { tri(b, 32, cy - r - 7, 32 - 3, cy - r + 1, 32 + 3, cy - r + 1, pal.deco); }
      if (s.stage >= 3) { disc(b, 32 - 6, cy + r - 1, 3, pal.body); disc(b, 32 + 6, cy + r - 1, 3, pal.body); disc(b, 32 - r + 1, cy + 3, 3, pal.body); disc(b, 32 + r - 1, cy + 3, 3, pal.body); }
      disc(b, 32, cy, r, pal.body);
      outline(b, pal.ink, 1);
      blush(b, 32, cy + 3, Math.round(r * 0.62), pal.cheek);
      eyes(b, 32, cy, Math.round(r * 0.42), s.stage === 1 ? 4 : 5, pal.ink, [0, 1], s.mood);
      px(b, 32, cy + 5, pal.ink); px(b, 31, cy + 6, pal.ink); px(b, 33, cy + 6, pal.ink); // tiny w mouth
      if (s.deco) deco(b, s.deco, cy - r, pal);
    },
  },
  // B — 八爪宝 (Claude-mascot blob): rounded dome + short tentacle nubs + a top curl.
  octo: {
    name: "八爪宝", tag: "Claude 吉祥物风 · 圆团 + 小触手",
    pal: { body: hx("#F2A98C"), deco: hx("#7FBE9E"), ink: hx("#7A4536"), cheek: hx("#E98E78") },
    variants: ["base", "curl", "long"],
    draw(b, s, pal) {
      const sc = [0, 0.74, 0.88, 1][s.stage], r = Math.round(15 * sc), cy = 33 - Math.round(r * 0.1);
      const nubs = s.stage === 1 ? 3 : s.stage === 2 ? 4 : 5;
      const baseY = cy + r - 1;
      for (let i = 0; i < nubs; i++) {
        const x = 32 - r + 2 + Math.round((i + 0.5) * (2 * r - 4) / nubs);
        if (s.variant === "long") { stroke(b, x, baseY, x + (i % 2 ? 3 : -3), baseY + 9, 2, pal.body); }
        else if (s.variant === "curl") { disc(b, x, baseY + 3, 3, pal.body); disc(b, x + 2, baseY + 5, 2, pal.body); }
        else disc(b, x, baseY + 2, 3, pal.body);
      }
      disc(b, 32, cy, r, pal.body); rrect(b, 32, cy + Math.round(r * 0.4), r, Math.round(r * 0.5), 4, pal.body);
      stroke(b, 32, cy - r + 1, 32 + 4, cy - r - 6, 1, pal.body); disc(b, 32 + 4, cy - r - 6, 2, pal.deco); // top curl
      outline(b, pal.ink, 1);
      blush(b, 32, cy + 4, Math.round(r * 0.6), pal.cheek);
      eyes(b, 32, cy, Math.round(r * 0.4), s.stage === 1 ? 4 : 5, pal.ink, [0, 1], s.mood);
      ell(b, 32, cy + 6, 2, 1, pal.ink); // small mouth
      if (s.deco) deco(b, s.deco, cy - r, pal);
    },
  },
  // C — 方头崽 (Tamagotchi 1-bit blocky): chunky, near 2-tone, thick outline, big beak, googly eyes.
  blocky: {
    name: "方头崽", tag: "拓麻歌子风 · 厚嘴方块 · 复古点阵",
    pal: { body: hx("#A9C27E"), deco: hx("#E8845B"), ink: hx("#37432A"), cheek: hx("#8AA862") },
    variants: ["base", "antenna", "wing"],
    draw(b, s, pal) {
      const sc = [0, 0.74, 0.88, 1][s.stage], hw = Math.round(13 * sc), hh = Math.round(14 * sc), cy = 34;
      if (s.variant === "antenna") { stroke(b, 32, cy - hh, 32, cy - hh - 7, 1, pal.ink); disc(b, 32, cy - hh - 8, 2, pal.deco); }
      if (s.variant === "wing") { tri(b, 32 - hw, cy, 32 - hw - 8, cy - 4, 32 - hw - 2, cy + 6, pal.body); tri(b, 32 + hw, cy, 32 + hw + 8, cy - 4, 32 + hw + 2, cy + 6, pal.body); }
      rrect(b, 32, cy, hw, hh, 4, pal.body);
      if (s.stage >= 2) { rrect(b, 32 - 6, cy + hh, 3, 3, 1, pal.body); rrect(b, 32 + 6, cy + hh, 3, 3, 1, pal.body); } // blocky feet
      outline(b, pal.ink, 2); // thick retro outline
      // googly mismatched eyes
      disc(b, 32 - 5, cy - 2, 4, [255, 255, 255]); disc(b, 32 + 6, cy - 1, 3, [255, 255, 255]);
      disc(b, 32 - 5, cy - 1, 2, pal.ink); disc(b, 32 + 6, cy - 1, 1, pal.ink);
      // thick beak mouth
      rrect(b, 32, cy + 6, 4, 2, 1, pal.deco); px(b, 32, cy + 6, pal.ink);
      if (s.deco) deco(b, s.deco, cy - hh, pal);
    },
  },
  // D — 企鹅 (Suica-card penguin): chubby slate-blue oval, white face+belly hood,
  // little orange beak + feet, tiny flippers. Calm, round, derpy.
  penguin: {
    name: "企鹅", tag: "Suica 卡小企鹅风 · 圆滚滚蓝灰",
    pal: { body: hx("#6F8DA9"), belly: hx("#FAFBFC"), beak: hx("#F2A23C"), ink: hx("#39465A"), cheek: hx("#F3B5BE"), foot: hx("#EF9A2E"), deco: hx("#F2A0B4") },
    variants: ["base", "crest", "fluff"],
    draw(b, s, pal) {
      const sc = [0, 0.74, 0.88, 1][s.stage], rx = Math.round(13 * sc), ry = Math.round(16 * sc), cy = 33;
      ell(b, 32 - 5, cy + ry, 3, 2, pal.foot); ell(b, 32 + 5, cy + ry, 3, 2, pal.foot); // feet
      if (s.variant === "crest") { stroke(b, 32, cy - ry, 32, cy - ry - 6, 1, pal.body); ell(b, 32, cy - ry - 7, 3, 2, pal.body); }
      if (s.variant === "fluff") { for (const [dx, dy] of [[-4, -ry - 1], [0, -ry - 4], [4, -ry - 1]]) disc(b, 32 + dx, cy + dy, 2, pal.body); }
      ell(b, 32, cy, rx, ry, pal.body); // body
      ell(b, 32 - rx, cy + 3, 2, 6, pal.body); ell(b, 32 + rx, cy + 3, 2, 6, pal.body); // flippers
      ell(b, 32, cy + 4, rx - 2, ry - 4, pal.belly); // white face + belly hood (top stays blue)
      outline(b, pal.ink, 1);
      eyes(b, 32, cy - 3, Math.round(rx * 0.34), s.stage === 1 ? 3 : 4, pal.ink, [0, 1], s.mood);
      tri(b, 32, cy + 1, 32 - 3, cy + 4, 32 + 3, cy + 4, pal.beak); px(b, 32, cy + 4, pal.ink); // beak
      blush(b, 32, cy + 2, Math.round(rx * 0.66), pal.cheek);
      if (s.deco) deco(b, s.deco, cy - ry, pal);
    },
  },
  // E — 熊本熊 (Kumamon-style bear): round charcoal blob, big white eyes, big RED round
  // cheeks (the signature), round ears, a cream muzzle. Bold + derpy.
  bear: {
    name: "熊本熊", tag: "熊本熊 / くまモン风 · 黑团红脸蛋",
    pal: { body: hx("#2E2E3A"), muzzle: hx("#F2E8D8"), ink: hx("#16161E"), cheek: hx("#E23838"), deco: hx("#F2A03C") },
    variants: ["base", "roundear", "ahoge"],
    draw(b, s, pal) {
      const sc = [0, 0.74, 0.88, 1][s.stage], r = Math.round(15 * sc), cy = 36 - Math.round(r * 0.1);
      const er = s.variant === "roundear" ? 6 : 5;
      disc(b, 32 - r + 2, cy - r + 2, er, pal.body); disc(b, 32 + r - 2, cy - r + 2, er, pal.body); // round ears
      if (s.variant === "ahoge") { stroke(b, 32, cy - r, 32 + 2, cy - r - 7, 1, pal.body); disc(b, 32 + 2, cy - r - 7, 1, pal.body); }
      if (s.stage >= 3) { disc(b, 32 - 6, cy + r - 1, 3, pal.body); disc(b, 32 + 6, cy + r - 1, 3, pal.body); } // feet
      disc(b, 32, cy, r, pal.body); // head/body
      outline(b, pal.ink, 1);
      const ex = Math.round(r * 0.42);
      const eyeR = s.stage === 1 ? 3 : 4;
      disc(b, 32 - ex, cy - 1, eyeR, [255, 255, 255]); disc(b, 32 + ex, cy - 1, eyeR, [255, 255, 255]); // big white eyes
      disc(b, 32 - ex, cy, 2, pal.ink); disc(b, 32 + ex, cy, 2, pal.ink);
      px(b, 32 - ex - 1, cy - 2, [255, 255, 255]); px(b, 32 + ex - 1, cy - 2, [255, 255, 255]);
      disc(b, 32 - r + 2, cy + 4, 3, pal.cheek); disc(b, 32 + r - 2, cy + 4, 3, pal.cheek); // big red cheeks
      ell(b, 32, cy + 6, 4, 3, pal.muzzle); // cream muzzle
      px(b, 32, cy + 4, pal.ink); px(b, 31, cy + 7, pal.ink); px(b, 32, cy + 8, pal.ink); px(b, 33, cy + 7, pal.ink); // nose + mouth
      if (s.deco) deco(b, s.deco, cy - r, pal);
    },
  },
};

function render(scheme, spec) {
  const b = canvas(); shadow(b, 57, 13);
  SCHEMES[scheme].draw(b, spec, SCHEMES[scheme].pal);
  return b;
}

// ---- montage: a labeled design sheet per scheme ----
const S = 5, PAD = 8, BG = [250, 248, 244];
function sheet(scheme) {
  const sc = SCHEMES[scheme];
  const rows = [
    // 成长: base form stage 1→2→3 + a happy face
    [{ stage: 1, variant: "base" }, { stage: 2, variant: "base" }, { stage: 3, variant: "base" }, { stage: 3, variant: "base", mood: "happy" }],
    // 进化: 3 variants at stage 3
    [{ stage: 3, variant: sc.variants[0] }, { stage: 3, variant: sc.variants[1] }, { stage: 3, variant: sc.variants[2] }, { stage: 3, variant: "base" }],
    // 装饰: teen + hat / bow / leaf
    [{ stage: 3, variant: "base", deco: "hat" }, { stage: 3, variant: "base", deco: "bow" }, { stage: 3, variant: "base", deco: "leaf" }, { stage: 3, variant: "base", mood: "happy", deco: "bow" }],
  ];
  const cols = 4, cell = W * S;
  const bw = cols * cell + (cols + 1) * PAD, bh = rows.length * cell + (rows.length + 1) * PAD;
  const big = new Uint8ClampedArray(bw * bh * 4);
  for (let i = 0; i < bw * bh; i++) { big[i * 4] = BG[0]; big[i * 4 + 1] = BG[1]; big[i * 4 + 2] = BG[2]; big[i * 4 + 3] = 255; }
  rows.forEach((row, r) => row.forEach((spec, c) => {
    const buf = render(scheme, spec), ox = PAD + c * (cell + PAD), oy = PAD + r * (cell + PAD);
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const sx = (x / S) | 0, sy = (y / S) | 0, si = (sy * W + sx) * 4;
      if (buf[si + 3] === 0) continue;
      const di = ((oy + y) * bw + (ox + x)) * 4; big[di] = buf[si]; big[di + 1] = buf[si + 1]; big[di + 2] = buf[si + 2]; big[di + 3] = 255;
    }
  }));
  writeFileSync(join(OUT, `${scheme}.png`), encode(big, bw, bh));
  return `${scheme} (${sc.name}) ${bw}x${bh}`;
}

for (const k of Object.keys(SCHEMES)) console.log(sheet(k));
console.log("rows = 成长(1→3+笑) · 进化(3变体) · 装饰(帽/蝶结/叶)");
