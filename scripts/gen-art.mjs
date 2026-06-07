#!/usr/bin/env node
// Procedural pixel-art engine v8 — FIVE distinct creatures aligned to the designer
// reference sheets (uploads/pet03–06): 奶团 puff = Chiikawa (white round cat, pink blush),
// 克劳德 claude = ClaudePet (coral rounded-square, closed arc eyes, two legs), 方头崽 blocky =
// fresh mint jelly-cube (glossy top, sprout), 波波企鹅 penguin (slate body, white belly,
// orange beak; gray fluff chick), 墩墩熊 bear = Kumamon (flat black, white eyes + black
// pupils, red round cheeks, ears). Soft flat fills + a body-tone outline + big silly eyes
// = 蠢萌. Each creature: size by stage, 3 care-branch variant features, the 7 moods, and
// activity poses (feed/clean/play). Adult gets a royal crown. Same interface
// (renderBuf/exports/main-loop/sprite paths) so the rest of the pipeline is unchanged.
// Usage: `node scripts/gen-art.mjs [lineId]`, then scripts/sync-art.sh.

import zlib from "node:zlib";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "miniprogram/assets/pets");
const LINES = JSON.parse(readFileSync(join(ROOT, "web/src/data/lines.json"), "utf8")).lines;
const W = 64, H = 64, R = Math.round;
const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// Palettes lifted from the reference sheets. `edge` = soft outline tone (a darker body
// shade, not pure black) so fills read as plush, not stickered.
const PAL = {
  puff:    { body: hx("#FBF4EA"), edge: hx("#B49A86"), ink: hx("#6E5C66"), cheek: hx("#F6A8BC"), ear: hx("#F4B6C6"), deco: hx("#F39FB4") },
  claude:  { body: hx("#D9684A"), edge: hx("#B14E37"), ink: hx("#3A2722"), leg: hx("#C25C40"), deco: hx("#7FBE9E") },
  blocky:  { body: hx("#A6DBBF"), edge: hx("#71B093"), ink: hx("#37574A"), hi: hx("#F0FBF6"), sprout: hx("#5DB082"), deco: hx("#F0A06A") },
  penguin: { body: hx("#5E7C97"), edge: hx("#3D4F64"), belly: hx("#FBFCFD"), beak: hx("#F2A23C"), foot: hx("#EF9A2E"), ink: hx("#2A3340"), cheek: hx("#F3B0BB"), gray: hx("#AEB8C2"), grayEdge: hx("#7E8A98"), deco: hx("#F39FB4") },
  bear:    { body: hx("#2B2B33"), edge: hx("#141419"), white: hx("#FFFFFF"), ink: hx("#141419"), cheek: hx("#E23A3A"), deco: hx("#F2C046") },
};

// ---- raster ----
function canvas() { return new Uint8ClampedArray(W * H * 4); }
function px(b, x, y, c, a = 255) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; b[i] = c[0]; b[i + 1] = c[1]; b[i + 2] = c[2]; b[i + 3] = a; }
const getA = (b, x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : b[(y * W + x) * 4 + 3];
function disc(b, cx, cy, r, c) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) px(b, cx + dx, cy + dy, c); }
function ell(b, cx, cy, rx, ry, c) { for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) px(b, cx + dx, cy + dy, c); }
function rrect(b, cx, cy, hw, hh, rad, c) { for (let dy = -hh; dy <= hh; dy++) for (let dx = -hw; dx <= hw; dx++) { const ox = Math.max(0, Math.abs(dx) - (hw - rad)), oy = Math.max(0, Math.abs(dy) - (hh - rad)); if (ox * ox + oy * oy <= rad * rad) px(b, cx + dx, cy + dy, c); } }
function tri(b, ax, ay, bx, by, cx, cy, c) { const mnx = Math.min(ax, bx, cx), mxx = Math.max(ax, bx, cx), mny = Math.min(ay, by, cy), mxy = Math.max(ay, by, cy); for (let y = mny; y <= mxy; y++) for (let x = mnx; x <= mxx; x++) { const w0 = (bx - ax) * (y - ay) - (by - ay) * (x - ax), w1 = (cx - bx) * (y - by) - (cy - by) * (x - bx), w2 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx); if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) px(b, x, y, c); } }
function stroke(b, x0, y0, x1, y1, r, c) { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0))); for (let i = 0; i <= n; i++) { const cx = x0 + (x1 - x0) * i / n, cy = y0 + (y1 - y0) * i / n; if (r <= 0) px(b, cx, cy, c); else disc(b, cx, cy, r, c); } }
function outline(b, col, th = 1) { for (let p = 0; p < th; p++) { const m = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = getA(b, x, y) > 0 ? 1 : 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (m[y * W + x]) continue; if (m[y * W + x - 1] || m[y * W + x + 1] || (y > 0 && m[(y - 1) * W + x]) || (y < H - 1 && m[(y + 1) * W + x])) px(b, x, y, col); } } }
function shadow(b, cy = 57, rx = 13) { for (let dy = -2; dy <= 2; dy++) for (let dx = -rx; dx <= rx; dx++) if ((dx * dx) / (rx * rx) + (dy * dy) / 4 <= 1) px(b, 32 + dx, cy + dy, [0, 0, 0], 30); }
function heart(b, x, y, c) { px(b, x, y, c); px(b, x + 2, y, c); px(b, x - 1, y + 1, c); px(b, x + 3, y + 1, c); for (let i = -1; i <= 3; i++) px(b, x + i, y + 2, c); px(b, x + 1, y + 3, c); }
function sparkle(b, x, y, c) { px(b, x, y, c); px(b, x - 1, y, c); px(b, x + 1, y, c); px(b, x, y - 1, c); px(b, x, y + 1, c); px(b, x - 2, y, mix(c, [255, 255, 255], 0.4)); px(b, x + 2, y, mix(c, [255, 255, 255], 0.4)); }
function blush2(b, cx, cy, c) { for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 3; xx++) px(b, cx + xx, cy + yy, c); }

// ---- eyes & mouths (shared expression vocabulary) ----
// closed smile-eye ‿ (ends up, middle down)
function smileEye(b, cx, cy, c, w = 2) { px(b, cx - w, cy, c); px(b, cx + w, cy, c); for (let dx = -w + 1; dx <= w - 1; dx++) px(b, cx + dx, cy + 1, c); }
// calm arch-eye ⌒ (ends down, middle up) — relaxed / sleepy
function calmEye(b, cx, cy, c, w = 2) { px(b, cx - w, cy + 1, c); px(b, cx + w, cy + 1, c); for (let dx = -w + 1; dx <= w - 1; dx++) px(b, cx + dx, cy, c); }
// flat closed line — (asleep)
function lineEye(b, cx, cy, c, w = 2) { for (let dx = -w; dx <= w; dx++) px(b, cx + dx, cy, c); }
// angry slant ＼ ／ (dir -1 = left eye ＼, +1 = right ／)
function angryEye(b, cx, cy, c, dir) { px(b, cx - dir, cy - 1, c); px(b, cx, cy, c); px(b, cx + dir, cy + 1, c); px(b, cx + dir, cy, c); }
// solid round dot
function dotEye(b, cx, cy, c, s = 1) { for (let yy = -s; yy <= s; yy++) for (let xx = -s; xx <= s; xx++) if (xx * xx + yy * yy <= s * s + 1) px(b, cx + xx, cy + yy, c); }
// kumamon white eye: big rounded white oval (4w×5h) + black pupil, explicit so it never
// collapses into a diamond at small radii.
function bigEye(b, cx, cy, P, mood) {
  const rows = { [-2]: [-1, 0], [-1]: [-2, -1, 0, 1], 0: [-2, -1, 0, 1], 1: [-2, -1, 0, 1], 2: [-1, 0] };
  for (const dy in rows) for (const dx of rows[dy]) px(b, cx + dx, cy + Number(dy), P.white);
  const py = mood === "sad" ? cy + 1 : cy;
  for (const [dx, dy] of [[-1, 0], [0, 0], [-1, 1], [0, 1]]) px(b, cx + dx, py + dy, P.ink); // 2×2 pupil
  px(b, cx - 1, py - 1, P.white); // glint
}

// dot-eyed faces (puff / penguin / blocky): pick the right closed/open eye by mood
function dotFace(b, cy, ex, mood, P, s = 1) {
  for (const sgn of [-1, 1]) {
    const cx = 32 + sgn * ex;
    if (mood === "happy" || mood === "eating") smileEye(b, cx, cy, P.ink, 2);
    else if (mood === "sleeping") lineEye(b, cx, cy, P.ink, 2);
    else if (mood === "sulk") angryEye(b, cx, cy, P.ink, sgn);
    else if (mood === "sad") dotEye(b, cx, cy + 1, P.ink, s);
    else dotEye(b, cx, cy, P.ink, s);
  }
}
// arc-eyed face (claude): the ClaudePet signature is two closed arcs
function arcFace(b, cy, ex, mood, P) {
  for (const sgn of [-1, 1]) {
    const cx = 32 + sgn * ex;
    if (mood === "happy" || mood === "eating") smileEye(b, cx, cy, P.ink, 3);
    else if (mood === "sleeping") calmEye(b, cx, cy, P.ink, 2);
    else if (mood === "sulk") angryEye(b, cx, cy, P.ink, sgn);
    else if (mood === "sad") calmEye(b, cx, cy - 1, P.ink, 2);
    else smileEye(b, cx, cy, P.ink, 2);
  }
}

// ---- ambient FX around the creature ----
function floatExtras(b, box, mood) {
  const { cy, hw, hh, ex } = box;
  if (mood === "happy") {
    heart(b, 32 - hw - 4, cy - hh - 1, [240, 120, 150]);
    heart(b, 32 + hw + 1, cy - hh - 4, [240, 120, 150]);
    sparkle(b, 32 - hw - 6, cy - 2, [255, 214, 120]);
    sparkle(b, 32 + hw + 6, cy + 2, [255, 214, 120]);
  }
  if (mood === "eating") { rrect(b, 32, cy + hh + 3, 5, 2, 1, [150, 118, 80]); disc(b, 32, cy + hh + 2, 1, [240, 184, 92]); }
  if (mood === "sleeping") { const Z = (ox, oy, s) => { for (let i = 0; i < s; i++) { px(b, ox + i, oy, [150, 168, 208]); px(b, ox + s - 1 - i, oy + i, [150, 168, 208]); px(b, ox + i, oy + s - 1, [150, 168, 208]); } }; Z(32 + hw + 1, cy - hh, 3); Z(32 + hw + 6, cy - hh - 5, 2); }
  if (mood === "sulk") { const c = [230, 80, 60], x = 32 + hw + 1, y = cy - hh + 1; px(b, x, y, c); px(b, x + 3, y, c); px(b, x + 1, y + 1, c); px(b, x + 2, y + 1, c); px(b, x, y + 2, c); px(b, x + 3, y + 2, c); }
  if (mood === "sad") { px(b, 32 - ex - 1, cy + 2, [120, 180, 230]); px(b, 32 - ex - 1, cy + 3, [150, 200, 240]); }
}
// activity props (feed pan / bath tub / play ball)
function actProp(b, box, act) {
  const { cy, hw, hh } = box, dark = [60, 62, 72];
  if (act === "feed") { stroke(b, 32 + hw, cy + 3, 32 + hw + 7, cy + 2, 1, [120, 92, 64]); ell(b, 32 + hw + 11, cy + 3, 4, 2, dark); disc(b, 32 + hw + 11, cy + 2, 1, [240, 184, 92]); }
  else if (act === "clean") { rrect(b, 32, cy + hh + 1, hw + 1, 3, 2, [156, 196, 224]); for (const [dx, dy] of [[-hw + 2, -hh + 1], [hw - 2, -hh + 4], [-3, -hh - 3], [5, -hh - 1]]) { disc(b, 32 + dx, cy + dy, 2, [232, 244, 252]); px(b, 32 + dx - 1, cy + dy - 1, [255, 255, 255]); } }
  else if (act === "play") { rrect(b, 32, cy + hh + 3, 7, 3, 2, [86, 90, 104]); px(b, 32 - 3, cy + hh + 3, [232, 96, 96]); px(b, 32 + 3, cy + hh + 2, [96, 164, 232]); }
}
// royal crown for the adult (成熟/royal) stage
function crown(b, cx, topY) {
  const g = [245, 198, 70], gd = [212, 158, 38];
  for (const sx of [-4, 0, 4]) { px(b, cx + sx, topY, g); px(b, cx + sx, topY + 1, g); }
  for (let dx = -4; dx <= 4; dx++) { px(b, cx + dx, topY + 2, g); px(b, cx + dx, topY + 3, gd); }
  px(b, cx, topY + 2, [230, 92, 110]);
  for (let dx = -5; dx <= 5; dx++) px(b, cx + dx, topY + 4, gd);
}

const SCALE = [0, 0.66, 0.82, 0.96, 1.10];
const stub = (b, x, y, c) => rrect(b, x, y, 2, 3, 1, c);
// little side arms; raised for happy. drawn before outline so they get wrapped.
function arms(b, P, hw, hh, cy, mood, node) {
  if (node < 2) return;
  if (mood === "happy" || mood === "eating") { disc(b, 32 - hw - 1, cy - hh + 1, 2, P.body); disc(b, 32 + hw + 1, cy - hh + 1, 2, P.body); }
  else { disc(b, 32 - hw, cy + 3, 2, P.body); disc(b, 32 + hw, cy + 3, 2, P.body); }
}

// =================== 5 CREATURES ===================
// each returns its face box { cy, hw, hh, ex }
const DRAW = {
  // 奶团 — Chiikawa: white round body, small cat ears (pink inner), dot eyes, pink blush
  puff(b, variant, node, mood) {
    const P = PAL.puff, sc = SCALE[node];
    let r = R(15 * sc), cy = 36 - R(r * 0.08);
    if (variant === "round") r = R(r * 1.12);
    const top = cy - r;
    // ears: cat-like triangles (bunny variant = long upright ovals)
    if (variant === "bunny") { ell(b, 32 - r + 3, top, 3, 8, P.body); ell(b, 32 + r - 3, top, 3, 8, P.body); }
    else { tri(b, 32 - r + 1, top + 4, 32 - r + 6, top + 4, 32 - r + 2, top - 3, P.body); tri(b, 32 + r - 1, top + 4, 32 + r - 6, top + 4, 32 + r - 2, top - 3, P.body); }
    if (variant === "horn") tri(b, 32, top - 7, 32 - 3, top + 1, 32 + 3, top + 1, P.deco);
    arms(b, P, r, r, cy, mood, node);
    if (node >= 3) { stub(b, 32 - 6, cy + r - 1, P.body); stub(b, 32 + 6, cy + r - 1, P.body); }
    disc(b, 32, cy, r, P.body);
    outline(b, P.edge);
    // pink ear insides (after outline so they sit on top)
    const ey = variant === "bunny" ? top + 1 : top + 1;
    px(b, 32 - r + 2, ey, P.ear); px(b, 32 + r - 2, ey, P.ear);
    if (variant === "round") { heart(b, 30, top - 1, [236, 120, 150]); }
    const ex = R(r * 0.42);
    dotFace(b, cy, ex, mood, P, 1);
    if (mood !== "sad" && mood !== "sulk") { blush2(b, 32 - ex - 4, cy + 3, P.cheek); blush2(b, 32 + ex + 1, cy + 3, P.cheek); }
    if (mood !== "sleeping") { px(b, 32, cy + 5, P.ink); px(b, 31, cy + 6, P.ink); px(b, 33, cy + 6, P.ink); } // tiny w mouth
    return { cy, hw: r, hh: r, ex };
  },
  // 克劳德 — ClaudePet: coral rounded-square, closed arc eyes, stub arms + two legs
  claude(b, variant, node, mood) {
    const P = PAL.claude, sc = SCALE[node];
    let hw = R(14 * sc), hh = R(12 * sc), cy = 33;
    if (variant === "round") { hw = R(hw * 1.14); hh = R(hh * 1.12); }
    const top = cy - hh;
    if (variant === "curl") { stroke(b, 32, top + 1, 32 + 3, top - 6, 1, P.body); disc(b, 32 + 3, top - 6, 2, P.deco); }
    if (variant === "ears") { rrect(b, 32 - hw + 3, top, 3, 3, 1, P.body); rrect(b, 32 + hw - 3, top, 3, 3, 1, P.body); }
    arms(b, P, hw, hh, cy, mood, node);
    if (node >= 2) for (const lx of [-R(hw * 0.5), R(hw * 0.5)]) stub(b, 32 + lx, cy + hh + 2, P.leg);
    rrect(b, 32, cy, hw, hh, 5, P.body);
    outline(b, P.edge);
    const ex = Math.max(5, R(hw * 0.46));
    arcFace(b, cy, ex, mood, P);
    if (mood === "eating") { disc(b, 32, cy + 5, 1, P.ink); }
    return { cy, hw, hh, ex };
  },
  // 方头崽 — fresh mint jelly-cube: glossy top highlight, sprout, dot eyes
  blocky(b, variant, node, mood) {
    const P = PAL.blocky, sc = SCALE[node];
    let hw = R(13 * sc), hh = R(13 * sc), cy = 34;
    if (variant === "round") { hw = R(hw * 1.16); hh = R(hh * 0.94); }
    const top = cy - hh;
    // sprout on top (signature). antenna variant = taller.
    const sH = variant === "antenna" ? 8 : 4;
    stroke(b, 32, top + 1, 32, top - sH, 1, P.sprout);
    tri(b, 32, top - sH, 32 - 3, top - sH + 2, 32 + 1, top - sH - 2, P.sprout);
    tri(b, 32 + 1, top - sH + 1, 32 + 4, top - sH + 3, 32, top - sH - 1, P.sprout);
    if (variant === "wing") { tri(b, 32 - hw, cy, 32 - hw - 7, cy - 3, 32 - hw - 1, cy + 5, P.body); tri(b, 32 + hw, cy, 32 + hw + 7, cy - 3, 32 + hw + 1, cy + 5, P.body); }
    if (node >= 2) { rrect(b, 32 - 6, cy + hh, 3, 2, 1, P.body); rrect(b, 32 + 6, cy + hh, 3, 2, 1, P.body); }
    rrect(b, 32, cy, hw, hh, 4, P.body);
    outline(b, P.edge);
    // glossy highlight, top-left
    for (const [dx, dy] of [[-hw + 3, -hh + 2], [-hw + 4, -hh + 2], [-hw + 3, -hh + 3], [-hw + 5, -hh + 2]]) px(b, 32 + dx, cy + dy, P.hi);
    const ex = R(hw * 0.46);
    dotFace(b, cy, ex, mood, P, 1);
    if (mood !== "sleeping") { px(b, 32, cy + 5, P.ink); px(b, 31, cy + 5, P.ink); px(b, 33, cy + 5, P.ink); }
    return { cy, hw, hh, ex };
  },
  // 波波企鹅 — slate body, white belly + face, orange beak/feet; gray fluff chick at baby
  penguin(b, variant, node, mood) {
    const P = PAL.penguin, sc = SCALE[node];
    let rx = R(12 * sc), ry = R(15 * sc), cy = 33;
    if (variant === "round") { rx = R(rx * 1.14); ry = R(ry * 1.0); }
    const chick = node === 1;
    const body = chick ? P.gray : P.body, edge = chick ? P.grayEdge : P.edge;
    // feet
    ell(b, 32 - 5, cy + ry, 3, 2, P.foot); ell(b, 32 + 5, cy + ry, 3, 2, P.foot);
    const top = cy - ry;
    if (variant === "crest") { stroke(b, 32, top, 32, top - 6, 1, body); ell(b, 32, top - 7, 3, 2, body); }
    if (variant === "fluff") for (const [dx, dy] of [[-4, -ry - 1], [0, -ry - 4], [4, -ry - 1]]) disc(b, 32 + dx, cy + dy, 2, body);
    // flippers (raised when happy)
    if (mood === "happy" || mood === "eating") { ell(b, 32 - rx - 1, cy - ry + 3, 2, 5, body); ell(b, 32 + rx + 1, cy - ry + 3, 2, 5, body); }
    else { ell(b, 32 - rx, cy + 3, 2, 6, body); ell(b, 32 + rx, cy + 3, 2, 6, body); }
    ell(b, 32, cy, rx, ry, body);
    if (!chick) { ell(b, 32, cy + 4, rx - 2, ry - 5, P.belly); ell(b, 32, cy - 4, rx - 3, 4, P.belly); } // belly + white face patch
    else ell(b, 32, cy + 4, rx - 3, ry - 6, mix(P.gray, [255, 255, 255], 0.5));
    outline(b, edge);
    const ex = R(rx * 0.4);
    dotFace(b, cy - 3, ex, mood, P, 1);
    tri(b, 32, cy, 32 - 3, cy + 3, 32 + 3, cy + 3, P.beak); px(b, 32, cy + 3, P.ink);
    if (mood !== "sad" && mood !== "sulk" && !chick) { blush2(b, 32 - rx, cy + 1, P.cheek); blush2(b, 32 + rx - 2, cy + 1, P.cheek); }
    return { cy, hw: rx, hh: ry, ex };
  },
  // 墩墩熊 — Kumamon: flat black round, white eyes + black pupils, red round cheeks, ears
  bear(b, variant, node, mood) {
    const P = PAL.bear, sc = SCALE[node];
    let r = R(15 * sc), cy = 36 - R(r * 0.08);
    if (variant === "round") r = R(r * 1.12);
    const er = variant === "roundear" ? 6 : 5, top = cy - r;
    disc(b, 32 - r + 1, top + 2, er, P.body); disc(b, 32 + r - 1, top + 2, er, P.body);
    if (variant === "ahoge") { stroke(b, 32, top, 32 + 2, top - 7, 1, P.body); disc(b, 32 + 2, top - 7, 1, P.body); }
    arms(b, P, r, r, cy, mood, node);
    if (node >= 3) { disc(b, 32 - 6, cy + r - 1, 3, P.body); disc(b, 32 + 6, cy + r - 1, 3, P.body); }
    disc(b, 32, cy, r, P.body);
    outline(b, P.edge);
    const ex = R(r * 0.4);
    if (mood === "happy" || mood === "eating") { for (const sgn of [-1, 1]) { const cx = 32 + sgn * ex; px(b, cx - 1, cy + 1, P.white); px(b, cx, cy, P.white); px(b, cx + 1, cy + 1, P.white); } }
    else if (mood === "sleeping") { for (const sgn of [-1, 1]) lineEye(b, 32 + sgn * ex, cy, P.white, 2); }
    else if (mood === "sulk") { for (const sgn of [-1, 1]) angryEye(b, 32 + sgn * ex, cy, P.white, sgn); }
    else { bigEye(b, 32 - ex, cy, P, mood); bigEye(b, 32 + ex, cy, P, mood); }
    if (node >= 2) { disc(b, 32 - r + 2, cy + 4, 3, P.cheek); disc(b, 32 + r - 2, cy + 4, 3, P.cheek); }
    // small mouth
    if (node >= 2 && mood !== "sleeping") { px(b, 31, cy + 6, P.edge); px(b, 32, cy + 7, P.edge); px(b, 33, cy + 6, P.edge); }
    return { cy, hw: r, hh: r, ex };
  },
};

function drawHide(b, P) {
  rrect(b, 32, 30, 8, 6, 3, P.body); outline(b, P.edge); dotFace(b, 29, 4, "idle", P, 0);
  rrect(b, 32, 47, 18, 8, 3, [150, 120, 86]); rrect(b, 32, 43, 18, 1, 0, [120, 95, 66]);
}
function drawEgg(b, body) {
  shadow(b, 56, 12);
  ell(b, 32, 35, 15, 19, mix(body, [255, 255, 255], 0.55));
  for (const [x, y] of [[26, 28], [38, 42], [30, 46], [40, 27]]) disc(b, x, y, 2, mix(body, [120, 90, 80], 0.28));
  px(b, 27, 24, [255, 255, 255]); px(b, 28, 24, [255, 255, 255]); // glint
  outline(b, mix(body, [70, 52, 52], 0.62));
}

const NODE = { egg: 0, baby: 1, child: 2, teen: 3, adult: 4 };
const MOODS = ["idle", "happy", "sad", "sleeping", "sulk", "hide", "eating"];
const ACTS = ["feed", "clean", "play"];
const EMOTION = new Set(MOODS);

function renderBuf(lineId, variant, stage, mood) {
  const b = canvas();
  if (stage === "egg") { drawEgg(b, PAL[lineId].body); return b; }
  shadow(b);
  if (mood === "hide") { drawHide(b, PAL[lineId]); return b; }
  const eyeMood = EMOTION.has(mood) ? mood : "idle"; // act poses use idle eyes
  const box = DRAW[lineId](b, variant, NODE[stage], eyeMood);
  if (stage === "adult") crown(b, 32, box.cy - box.hh - (lineId === "blocky" ? 9 : 6));
  floatExtras(b, box, eyeMood);
  if (ACTS.includes(mood)) actProp(b, box, mood);
  return b;
}
function render(lineId, variant, stage, mood) { return encode(renderBuf(lineId, variant, stage, mood)); }

export { renderBuf, encode, LINES, W, H, MOODS, ACTS, PAL };

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
  writeFileSync(join(OUT, "_fallback", "blob.png"), render("claude", "true", "child", "idle"));
  console.log(`rendered ${n} sprites${only ? " for " + only : " (5 creatures)"}`);
}
