#!/usr/bin/env node
// Procedural pixel-art engine v6 — the 克劳德 (Claude-mascot) design language. Flat fills
// + a soft darker outline + small wide-set dark eyes; deliberately simple & 蠢萌, modelled
// on the official Claude mascot the owner shared. Same interface as before (renderBuf /
// render / exports / main loop), so the whole pipeline (sync, codex, game) is unchanged —
// only the LOOK is new. Each of the 4 lines = a 克劳德 with its own colour + signature
// feature; care-branch variants change the feature/shape; moods include activity-ish poses
// (eating = food bowl, sleeping = lying + zzz).
//
// Usage: `node scripts/gen-art.mjs [lineId]`. Then scripts/sync-art.sh.

import zlib from "node:zlib";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "miniprogram/assets/pets");
const LINES = JSON.parse(readFileSync(join(ROOT, "web/src/data/lines.json"), "utf8")).lines;
const W = 64, H = 64, R = Math.round;
const INK = [42, 42, 52], BLUSH = [240, 150, 162];

// per-line 克劳德 colour + top feature
const LINE = {
  mochi_pudding: { body: [0xF4, 0xAE, 0xC4], leg: [0xDC, 0x84, 0x9E], feat: "swirl" },
  echo_fox: { body: [0x97, 0x89, 0xC4], leg: [0x76, 0x69, 0xA2], feat: "ears" },
  ember_imp: { body: [0xE0, 0x71, 0x4C], leg: [0xC2, 0x55, 0x38], feat: "flame" },
  sproutling: { body: [0x9C, 0xC5, 0x6C], leg: [0x7D, 0xA6, 0x4F], feat: "sprout" },
};

// ---- color + raster ----
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
function canvas() { return new Uint8ClampedArray(W * H * 4); }
function px(b, x, y, c, a = 255) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; b[i] = c[0]; b[i + 1] = c[1]; b[i + 2] = c[2]; b[i + 3] = a; }
const getA = (b, x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : b[(y * W + x) * 4 + 3];
function disc(b, cx, cy, r, c) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) px(b, cx + dx, cy + dy, c); }
function ell(b, cx, cy, rx, ry, c) { for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) px(b, cx + dx, cy + dy, c); }
function rrect(b, cx, cy, hw, hh, rad, c) { for (let dy = -hh; dy <= hh; dy++) for (let dx = -hw; dx <= hw; dx++) { const ox = Math.max(0, Math.abs(dx) - (hw - rad)), oy = Math.max(0, Math.abs(dy) - (hh - rad)); if (ox * ox + oy * oy <= rad * rad) px(b, cx + dx, cy + dy, c); } }
function tri(b, ax, ay, bx, by, cx, cy, c) { const mnx = Math.min(ax, bx, cx), mxx = Math.max(ax, bx, cx), mny = Math.min(ay, by, cy), mxy = Math.max(ay, by, cy); for (let y = mny; y <= mxy; y++) for (let x = mnx; x <= mxx; x++) { const w0 = (bx - ax) * (y - ay) - (by - ay) * (x - ax), w1 = (cx - bx) * (y - by) - (cy - by) * (x - bx), w2 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx); if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) px(b, x, y, c); } }
function stroke(b, x0, y0, x1, y1, r, c) { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0))); for (let i = 0; i <= n; i++) { const cx = x0 + (x1 - x0) * i / n, cy = y0 + (y1 - y0) * i / n; if (r <= 0) px(b, cx, cy, c); else disc(b, cx, cy, r, c); } }
function outline(b, col) { const m = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = getA(b, x, y) > 0 ? 1 : 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (m[y * W + x]) continue; if (m[y * W + x - 1] || m[y * W + x + 1] || (y > 0 && m[(y - 1) * W + x]) || (y < H - 1 && m[(y + 1) * W + x])) px(b, x, y, col); } }
function shadow(b, cy = 57, rx = 13) { for (let dy = -2; dy <= 2; dy++) for (let dx = -rx; dx <= rx; dx++) if ((dx * dx) / (rx * rx) + (dy * dy) / 4 <= 1) px(b, 32 + dx, cy + dy, [0, 0, 0], 30); }
function heart(b, x, y, c) { px(b, x, y, c); px(b, x + 2, y, c); px(b, x - 1, y + 1, c); px(b, x + 3, y + 1, c); for (let i = -1; i <= 3; i++) px(b, x + i, y + 2, c); px(b, x + 1, y + 3, c); }

// ---- eyes by mood (small, wide-set, dark) ----
function eyes(b, cy, ex, mood) {
  for (const e of [-ex, ex]) {
    if (mood === "happy") { px(b, 32 + e - 1, cy + 1, INK); px(b, 32 + e, cy, INK); px(b, 32 + e + 1, cy + 1, INK); }
    else if (mood === "sleeping") { px(b, 32 + e - 1, cy, INK); px(b, 32 + e, cy + 1, INK); px(b, 32 + e + 1, cy, INK); }
    else if (mood === "sad") { px(b, 32 + e - 1, cy, INK); px(b, 32 + e, cy + 1, INK); px(b, 32 + e + 1, cy, INK); }
    else if (mood === "sulk") { px(b, 32 + e - 1, cy - 1, INK); px(b, 32 + e, cy - 1, INK); px(b, 32 + e + 1, cy, INK); }
    else { for (let yy = 0; yy < 3; yy++) { px(b, 32 + e, cy - 1 + yy, INK); px(b, 32 + e + 1, cy - 1 + yy, INK); } }
  }
}

// ---- line + variant top features ----
function topFeature(b, lineId, variant, topY, hw, body) {
  if (lineId === "mochi_pudding") {
    stroke(b, 32, topY + 1, 32 + 3, topY - 5, 1, [255, 240, 204]); disc(b, 32 + 3, topY - 5, 1, [255, 240, 204]);
    if (variant === "brim") { disc(b, 30, topY - 6, 2, [226, 64, 90]); stroke(b, 30, topY - 7, 31, topY - 10, 0, [120, 170, 70]); } // cherry
  } else if (lineId === "echo_fox") {
    if (variant === "plush") { disc(b, 32 - hw + 3, topY + 1, 3, body); disc(b, 32 + hw - 3, topY + 1, 3, body); } // fluffy ears
    else if (variant === "ward") { tri(b, 32 - 3, topY + 1, 32 - 4, topY - 6, 32 + 1, topY, [255, 150, 60]); tri(b, 32 + 3, topY + 1, 32, topY - 7, 32 + 4, topY, [255, 214, 100]); } // lantern flame
    else { tri(b, 32 - hw + 5, topY + 2, 32 - hw + 1, topY - 5, 32 - hw + 8, topY + 1, body); tri(b, 32 + hw - 5, topY + 2, 32 + hw - 1, topY - 5, 32 + hw - 8, topY + 1, body); } // pointy ears
  } else if (lineId === "ember_imp") {
    const hot = variant === "crackle" ? [255, 224, 96] : [255, 206, 86];
    tri(b, 32 - 4, topY + 2, 32 - 5, topY - 6, 32, topY, [232, 96, 40]); tri(b, 32 + 4, topY + 2, 32 + 5, topY - 6, 32, topY, [232, 96, 40]); tri(b, 32, topY + 1, 32, topY - 9, 32 + 2, topY, hot);
    if (variant === "crackle") { stroke(b, 32 - 9, topY + 4, 32 - 7, topY + 7, 0, [255, 232, 96]); stroke(b, 32 - 7, topY + 7, 32 - 10, topY + 10, 0, [255, 232, 96]); } // spark bolt
  } else if (lineId === "sproutling") {
    stroke(b, 32, topY + 1, 32, topY - 7, 1, [108, 158, 80]);
    tri(b, 32, topY - 4, 32 - 5, topY - 8, 32 - 1, topY - 10, [128, 200, 108]); tri(b, 32, topY - 4, 32 + 5, topY - 8, 32 + 1, topY - 10, [150, 216, 124]);
    if (variant === "harvest") { disc(b, 30, topY - 9, 2, [226, 96, 120]); disc(b, 35, topY - 7, 2, [226, 96, 120]); } // berries
  }
}

// ---- variant body overlays (after outline) ----
function bodyOverlay(b, lineId, variant, cy, hw, hh) {
  if (variant === "ward" && lineId === "mochi_pudding") { disc(b, 32, cy + 2, 3, [255, 244, 196]); heart(b, 31, cy, [255, 130, 162]); for (let a = 0; a < 7; a++) px(b, 32 + R((hw + 3) * Math.cos(-Math.PI + a / 6 * Math.PI)), cy - hh - 5 + R(3 * Math.sin(-Math.PI + a / 6 * Math.PI)), [255, 226, 130]); }
  if (variant === "forge") { rrect(b, 32, cy + 2, 3, 3, 1, [255, 196, 86]); px(b, 32, cy + 2, [255, 240, 200]); }
  if (variant === "swift") { stroke(b, 32 + hw - 1, cy + hh - 2, 32 + hw + 6, cy + hh - 6, 1, LINE.echo_fox.body); disc(b, 32 + hw + 6, cy + hh - 6, 2, [200, 220, 255]); } // tail curl + crescent dot
  if (variant === "gust") { tri(b, 32 - hw, cy, 32 - hw - 8, cy - 4, 32 - hw - 1, cy + 5, [170, 220, 130]); tri(b, 32 + hw, cy, 32 + hw + 8, cy - 4, 32 + hw + 1, cy + 5, [170, 220, 130]); } // leaf wings
  if (variant === "dorm") { for (const [dx, dy] of [[-hw + 3, -hh + 3], [hw - 4, -2], [-2, hh - 4]]) px(b, 32 + dx, cy + dy, [120, 168, 90]); } // moss
}

// activity props (the pet DOING the action) — drawn over an idle body
function actProp(b, act, cy, hw, hh) {
  const dark = [60, 62, 72];
  if (act === "feed") { stroke(b, 32 + hw, cy + 3, 32 + hw + 7, cy + 2, 1, [120, 92, 64]); ell(b, 32 + hw + 11, cy + 3, 4, 2, dark); disc(b, 32 + hw + 11, cy + 2, 1, [240, 184, 92]); } // frying pan
  else if (act === "clean") { rrect(b, 32, cy + hh + 1, hw, 3, 2, [156, 120, 80]); for (const [dx, dy] of [[-hw + 2, -hh + 1], [hw - 2, -hh + 4], [-3, -hh - 3], [5, -hh - 1]]) { disc(b, 32 + dx, cy + dy, 2, [232, 244, 252]); px(b, 32 + dx - 1, cy + dy - 1, [255, 255, 255]); } } // tub + bubbles
  else if (act === "play") { rrect(b, 32, cy + hh + 3, 7, 3, 2, [86, 90, 104]); px(b, 32 - 3, cy + hh + 3, [232, 96, 96]); px(b, 32 + 3, cy + hh + 2, [96, 164, 232]); } // controller
}

function drawClaude(b, lineId, variant, node, mood) {
  const L = LINE[lineId];
  let body = [...L.body], leg = [...L.leg];
  if (variant === "dorm") { body = [0xB0, 0xA6, 0x92]; leg = [0x8C, 0x82, 0x70]; }
  const sc = [0, 0.72, 0.84, 0.95, 1.05][node];
  let hw = R(14 * sc), hh = R(11 * sc); const cy = 33;
  if (variant === "brim" || variant === "brimimp") { hw = R(hw * 1.14); hh = R(hh * 1.1); }
  if (variant === "hop" || variant === "swift") { hh = R(hh * 1.22); hw = R(hw * 0.9); }
  const ex = Math.max(4, R(hw * 0.44));

  if (mood === "hide") {
    rrect(b, 32, 31, 8, 6, 3, body); outline(b, leg); eyes(b, 30, 4, "idle");
    rrect(b, 32, 47, 18, 8, 3, [150, 120, 86]); rrect(b, 32, 43, 18, 1, 0, [120, 95, 66]);
    return;
  }
  if (mood === "sleeping") {
    const lw = R(hw * 1.2), lh = R(hh * 0.74);
    rrect(b, 32, cy + 7, lw, lh, 5, body); outline(b, leg);
    eyes(b, cy + 6, ex, "sleeping");
    const Z = (ox, oy, s) => { for (let i = 0; i < s; i++) { px(b, ox + i, oy, [150, 168, 208]); px(b, ox + s - 1 - i, oy + i, [150, 168, 208]); px(b, ox + i, oy + s - 1, [150, 168, 208]); } };
    Z(44, cy - 1, 3); Z(49, cy - 6, 2);
    return;
  }

  const ly = cy + hh + 2;
  for (const lx of [-hw + 3, -R(hw * 0.32), R(hw * 0.32), hw - 3]) rrect(b, 32 + lx, ly, 2, 3, 1, leg);
  rrect(b, 32, cy, hw, hh, 5, body);
  topFeature(b, lineId, variant, cy - hh, hw, body);
  outline(b, leg);

  eyes(b, cy, ex, mood);
  if (mood !== "sad" && mood !== "sulk") for (const cx of [32 - hw + 2, 32 + hw - 3]) { px(b, cx, cy + 2, BLUSH); px(b, cx + 1, cy + 2, BLUSH); px(b, cx, cy + 3, BLUSH); px(b, cx + 1, cy + 3, BLUSH); }
  if (mood === "happy") { heart(b, 32 - hw - 3, cy - 3, [240, 120, 150]); heart(b, 32 + hw, cy - 6, [240, 120, 150]); }
  if (mood === "eating") { rrect(b, 32, cy + hh + 3, 5, 2, 1, [150, 118, 80]); disc(b, 32, cy + hh + 2, 1, [240, 184, 92]); }
  if (mood === "sad") { px(b, 32 + ex, cy + 2, [120, 180, 230]); px(b, 32 + ex, cy + 3, [120, 180, 230]); }
  if (mood === "sulk") { const c = [230, 80, 60]; px(b, 41, cy - 6, c); px(b, 43, cy - 6, c); px(b, 42, cy - 5, c); px(b, 41, cy - 4, c); px(b, 43, cy - 4, c); }
  bodyOverlay(b, lineId, variant, cy, hw, hh);
  if (mood === "feed" || mood === "clean" || mood === "play") actProp(b, mood, cy, hw, hh);
}

function drawEgg(b, body) {
  shadow(b, 56, 12);
  ell(b, 32, 35, 15, 19, mix(body, [255, 255, 255], 0.5));
  for (const [x, y] of [[26, 28], [38, 42], [30, 46], [40, 27]]) disc(b, x, y, 2, body);
  outline(b, mix(body, [0, 0, 0], 0.4));
}

const NODE = { egg: 0, baby: 1, child: 2, teen: 3, adult: 4 };
const MOODS = ["idle", "happy", "sad", "sleeping", "sulk", "hide", "eating"];
const ACTS = ["feed", "clean", "play"]; // transient activity poses (client swaps to these on tap)

function renderBuf(lineId, variant, stage, mood) {
  const b = canvas();
  if (stage === "egg") { drawEgg(b, LINE[lineId].body); return b; }
  shadow(b);
  drawClaude(b, lineId, variant, NODE[stage], mood);
  return b;
}
function render(lineId, variant, stage, mood) { return encode(renderBuf(lineId, variant, stage, mood)); }

export { renderBuf, encode, LINES, W, H };

// ---- PNG ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++)c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++)c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length, 0); const b = Buffer.concat([Buffer.from(t, "ascii"), d]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(b), 0); return Buffer.concat([l, b, cr]); };
function encode(rgba, w = W, h = H) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer).copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ---- main ----
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
const only = process.argv[2];
let n = 0;
function writeSet(dir, lineId, variant, stages) {
  mkdirSync(dir, { recursive: true });
  for (const stage of stages) {
    if (stage === "egg") { writeFileSync(join(dir, "egg.png"), render(lineId, variant, "egg", "idle")); n++; continue; }
    for (const mood of MOODS) { writeFileSync(join(dir, `${stage}_${mood}.png`), render(lineId, variant, stage, mood)); n++; }
    for (const act of ACTS) { writeFileSync(join(dir, `${stage}_${act}.png`), render(lineId, variant, stage, act)); n++; }
  }
}
if (isMain) {
  for (const [lineId, line] of Object.entries(LINES)) {
    if (only && lineId !== only) continue;
    writeSet(join(OUT, lineId), lineId, "true", ["egg", "baby", "child", "teen", "adult"]);
    for (const b of Object.values(line.branches)) writeSet(join(OUT, `${lineId}__${b.variant}`), lineId, b.variant, ["teen", "adult"]);
  }
  mkdirSync(join(OUT, "_fallback"), { recursive: true });
  writeFileSync(join(OUT, "_fallback", "blob.png"), render("ember_imp", "true", "child", "idle"));
  console.log(`rendered ${n} sprites${only ? " for " + only : " (4 lines · 克劳德 style)"}`);
}
