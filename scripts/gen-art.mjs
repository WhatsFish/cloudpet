#!/usr/bin/env node
// Procedural pixel-art engine v3 (pure Node, built-in zlib). V4 EVOLUTION MODEL:
// 4 within-lineage LINES (web/src/data/lines.json). Each pet is ONE creature egg→adult;
// care sculpts WHICH variant of itself it becomes. Real SILHOUETTE EVENTS fire at the
// teen/adult NODES (a part grows / splits / appears / recolors) — NOT a uniform upscale.
//
// Output layout (spritePath-compatible, zero client change):
//   pets/<line>/{egg, baby_*, child_*, teen_*, adult_*}   ← shared trunk + the TRUE form
//   pets/<line>__<variant>/{teen_*, adult_*}              ← the 3 care branches
//
// Usage: `node scripts/gen-art.mjs [lineId]` (no arg = all 4 lines). Then sync-art.sh.

import zlib from "node:zlib";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "miniprogram/assets/pets");
const LINES = JSON.parse(readFileSync(join(ROOT, "web/src/data/lines.json"), "utf8")).lines;
const W = 64, H = 64;
const INK = [38, 30, 50];
const R = Math.round;

// ---- color ----
const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgbHex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
function ramp(hex) {
  const base = hx(hex);
  return { base, hi: mix(base, [255, 255, 255], 0.42), sh: mix(base, [38, 28, 60], 0.36), out: mix(base, [22, 16, 34], 0.72) };
}
const tint = (rm, c, t) => ramp(rgbHex(mix(rm.base, c, t)));

// ---- raster ----
function canvas() { return new Uint8ClampedArray(W * H * 4); }
function px(buf, x, y, c, a = 255) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = a;
}
const getA = (buf, x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : buf[(y * W + x) * 4 + 3];

function ball(buf, cx, cy, r, rm) {
  const lx = cx - r * 0.42, ly = cy - r * 0.42;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r) continue;
    const nl = 1 - Math.hypot(cx + dx - lx, cy + dy - ly) / (2 * r);
    px(buf, cx + dx, cy + dy, nl > 0.74 ? rm.hi : nl > 0.4 ? rm.base : rm.sh);
  }
  if (r >= 5) { px(buf, lx, ly, mix(rm.hi, [255, 255, 255], 0.5)); px(buf, lx + 1, ly, mix(rm.hi, [255, 255, 255], 0.3)); }
}
function blob(buf, cx, cy, rx, ry, rm) {
  for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
    if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) > 1) continue;
    const t = (dy + ry) / (2 * ry);
    px(buf, cx + dx, cy + dy, t < 0.28 && dx < rx * 0.3 ? rm.hi : t > 0.7 ? rm.sh : rm.base);
  }
}
function rrect(buf, cx, cy, hw, hh, rad, rm) {
  for (let dy = -hh; dy <= hh; dy++) for (let dx = -hw; dx <= hw; dx++) {
    const ox = Math.max(0, Math.abs(dx) - (hw - rad)), oy = Math.max(0, Math.abs(dy) - (hh - rad));
    if (ox * ox + oy * oy > rad * rad) continue;
    const t = (dy + hh) / (2 * hh);
    px(buf, cx + dx, cy + dy, t < 0.26 && dx < hw * 0.3 ? rm.hi : t > 0.72 ? rm.sh : rm.base);
  }
}
function tri(buf, ax, ay, bx, by, cx, cy, c) {
  const mnx = Math.min(ax, bx, cx), mxx = Math.max(ax, bx, cx), mny = Math.min(ay, by, cy), mxy = Math.max(ay, by, cy);
  for (let y = mny; y <= mxy; y++) for (let x = mnx; x <= mxx; x++) {
    const w0 = (bx - ax) * (y - ay) - (by - ay) * (x - ax), w1 = (cx - bx) * (y - by) - (cy - by) * (x - bx), w2 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
    if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) px(buf, x, y, c);
  }
}
function stroke(buf, x0, y0, x1, y1, r, c) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) { const cx = x0 + (x1 - x0) * i / n, cy = y0 + (y1 - y0) * i / n; for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r) px(buf, cx + xx, cy + yy, c); }
}
function outline(buf, col) {
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mask[y * W + x] = getA(buf, x, y) > 0 ? 1 : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (mask[y * W + x]) continue;
    if (mask[y * W + x - 1] || mask[y * W + x + 1] || (y > 0 && mask[(y - 1) * W + x]) || (y < H - 1 && mask[(y + 1) * W + x])) px(buf, x, y, col);
  }
}
function shadow(buf, cy = 57, rx = 14) { for (let dy = -3; dy <= 3; dy++) for (let dx = -rx; dx <= rx; dx++) if ((dx * dx) / (rx * rx) + (dy * dy) / 9 <= 1) px(buf, 32 + dx, cy + dy, [0, 0, 0], 34); }
function badge(buf, cx, cy) { const c = [255, 210, 90]; px(buf, cx, cy - 1, c); px(buf, cx - 1, cy, c); px(buf, cx + 1, cy, c); px(buf, cx, cy, [255, 245, 200]); px(buf, cx, cy + 1, c); }
function star(buf, x, y, c = [255, 230, 120]) { px(buf, x, y - 1, c); px(buf, x, y + 1, c); px(buf, x - 1, y, c); px(buf, x + 1, y, c); px(buf, x, y, [255, 255, 255]); }
function flame(buf, x, y, h, hot = [255, 210, 90], edge = [235, 90, 30]) { tri(buf, x - 3, y, x - 4, y - h + 4, x + 1, y - 1, edge); tri(buf, x + 3, y, x + 4, y - h + 4, x - 1, y - 1, edge); tri(buf, x, y, x - 2, y - h, x + 3, y - 1, hot); tri(buf, x, y - 1, x, y - h + 3, x + 2, y - 1, [255, 240, 150]); }

// ---- face ----
function face(buf, cx, cy, mood, sp, eye = 2) {
  const lx = cx - sp, rx = cx + sp;
  const drawEye = (ex) => { for (let yy = -eye; yy <= eye; yy++) for (let xx = -eye; xx <= eye; xx++) if (xx * xx * 1.7 + yy * yy * 1.1 <= eye * eye + 0.6) px(buf, ex + xx, cy + yy, INK); px(buf, ex - 1, cy - 1, [255, 255, 255]); px(buf, ex + 1, cy + 1, mix(INK, [255, 255, 255], 0.25)); };
  if (mood === "sleeping") { for (let x = -2; x <= 2; x++) { px(buf, lx + x, cy, INK); px(buf, rx + x, cy, INK); } px(buf, cx, cy + 5, INK); return; }
  if (mood === "happy" || mood === "eating") {
    for (const ex of [lx, rx]) { px(buf, ex - 1, cy - 1, INK); px(buf, ex, cy - 2, INK); px(buf, ex + 1, cy - 1, INK); px(buf, ex, cy, INK); }
    if (mood === "eating") { for (let x = -2; x <= 2; x++) px(buf, cx + x, cy + 4, INK); px(buf, cx, cy + 6, [225, 120, 130]); }
    else for (let x = -3; x <= 3; x++) px(buf, cx + x, cy + 5 + (Math.abs(x) === 3 ? -1 : 0), INK);
    px(buf, lx - 2, cy + 3, [255, 150, 170], 170); px(buf, rx + 2, cy + 3, [255, 150, 170], 170);
    return;
  }
  drawEye(lx); drawEye(rx);
  if (mood === "sad") { for (let x = -2; x <= 2; x++) px(buf, cx + x, cy + 6 + (Math.abs(x) === 2 ? -1 : 0), INK); px(buf, rx + 1, cy + 3, [110, 180, 230]); px(buf, lx, cy - 3, INK); px(buf, rx, cy - 3, INK); }
  else if (mood === "sulk") { px(buf, lx - 1, cy - 3, INK); px(buf, lx, cy - 3, INK); px(buf, rx, cy - 3, INK); px(buf, rx + 1, cy - 3, INK); for (let x = -2; x <= 2; x++) px(buf, cx + x, cy + 5, INK); }
  else { px(buf, cx - 1, cy + 5, INK); px(buf, cx, cy + 5, INK); px(buf, cx + 1, cy + 5, INK); }
}

// ---- FX overlays ----
const FX = {
  hearts(b) { for (const [x, y] of [[15, 16], [49, 22], [21, 10]]) { const c = [255, 110, 150]; px(b, x, y, c); px(b, x + 2, y, c); px(b, x - 1, y + 1, c); px(b, x + 3, y + 1, c); for (let i = -1; i <= 3; i++) px(b, x + i, y + 2, c); px(b, x + 1, y + 3, c); } },
  sparkle(b) { for (const [x, y] of [[16, 14], [48, 18], [22, 9], [44, 36]]) star(b, x, y); },
  zzz(b) { const c = [150, 170, 210]; const Z = (ox, oy, s) => { for (let i = 0; i < s; i++) px(b, ox + i, oy, c); for (let i = 0; i < s; i++) px(b, ox + s - 1 - i, oy + i, c); for (let i = 0; i < s; i++) px(b, ox + i, oy + s - 1, c); }; Z(44, 14, 3); Z(49, 9, 2); },
  food(b) { const c = [210, 150, 90]; for (const [x, y] of [[20, 40], [44, 42], [16, 44]]) { px(b, x, y, c); px(b, x + 1, y, mix(c, [255, 255, 255], 0.3)); } },
  anger(b) { const c = [230, 60, 50], x = 46, y = 13; px(b, x, y, c); px(b, x + 2, y, c); px(b, x + 1, y + 1, c); px(b, x, y + 2, c); px(b, x + 2, y + 2, c); },
  none() {},
};
const FXOF = { happy: "hearts", eating: "food", sleeping: "zzz", sulk: "anger", sad: "none", idle: "none", hide: "none" };

// ---- node + growth ----
const NODE = { egg: 0, baby: 1, child: 2, teen: 3, adult: 4 };
const SCALE = [0, 0.66, 0.82, 1.0, 1.14];
const FEAT = [0, 0.45, 0.7, 0.9, 1.0];
const MOODS = ["idle", "happy", "sad", "sleeping", "sulk", "hide", "eating"];

// variant identity tint applied to the body ramp (subtle, so the silhouette carries it)
function bodyRamp(rm, variant) {
  if (variant === "brim" || variant === "plush" || variant === "brimimp" || variant === "harvest") return tint(rm, [255, 240, 222], 0.1);
  if (variant === "ward" || variant === "forge" || variant === "dorm") return tint(rm, [120, 96, 70], 0.12);
  return rm; // true / engage keep the pure line accent
}

// =================== LINE BLUEPRINTS ===================
const DRAW = {
  // ---------- 抖抖布丁: soft pudding/团子 ----------
  mochi_pudding(buf, rm0, variant, node, mood) {
    const rm = bodyRamp(rm0, variant), teen = node >= 3, adult = node >= 4;
    const sc = SCALE[node], f = FEAT[node];
    const wide = variant === "brim" && teen ? 1.22 : 1.0;
    const tall = variant === "hop" && teen ? 1.22 : 1.0;
    const s = R(15 * sc), cy = 40 - R(s * 0.1), rx = R(s * wide), ry = R(s * 1.12 * tall);
    // hop: little nub feet under the body
    if (variant === "hop" && teen) { const ft = tint(rm, [40, 30, 50], 0.22); ball(buf, 32 - 6, cy + ry - 2, adult ? 4 : 3, ft); ball(buf, 32 + 6, cy + ry - 2, adult ? 4 : 3, ft); }
    // syrup drip + curl
    tri(buf, 32, cy - ry - 5, 32 - 5, cy - ry + 3, 32 + 5, cy - ry + 3, rm.sh);
    for (let i = 0; i < 3 + R(2 * f); i++) px(buf, 33 + i, cy - ry - 3 - i, [230, 170, 90]);
    if (variant === "brim" && adult) for (let i = 0; i < 4; i++) px(buf, 28 - i, cy - ry - 2 - i, [230, 170, 90]); // 2nd swirl
    blob(buf, 32, cy, rx, ry, rm);
    // brim: cheek dots + cherry
    if (variant === "brim" && teen) { px(buf, 32 - rx + 2, cy + 2, [255, 170, 195]); px(buf, 32 + rx - 2, cy + 2, [255, 170, 195]); if (adult) { ball(buf, 30, cy - ry - 3, 2, ramp("#E23B5A")); stroke(buf, 30, cy - ry - 4, 31, cy - ry - 8, 1, [120, 170, 70]); } }
    // ward: glowing heart-core + halo + ward dots
    if (variant === "ward" && teen) {
      ball(buf, 32, cy + 2, R(s * 0.34), ramp("#FFF0C0")); px(buf, 32, cy + 2, [255, 120, 165]);
      for (let a = 0; a < 9; a++) px(buf, 32 + R((s + 3) * Math.cos(-Math.PI + a / 8 * Math.PI)), cy - ry - 6 + R(3 * Math.sin(-Math.PI + a / 8 * Math.PI)), [255, 226, 130]); // halo arc
      if (adult) for (const [dx, dy] of [[-rx - 4, -2], [rx + 4, -4], [0, -ry - 9]]) star(buf, 32 + dx, cy + dy, [255, 214, 120]);
    }
    // mouth heart (skip when sleeping)
    if (mood !== "sleeping" && variant !== "ward") { const h = [255, 120, 165]; px(buf, 31, cy + 3, h); px(buf, 33, cy + 3, h); px(buf, 30, cy + 4, h); px(buf, 34, cy + 4, h); for (let x = 30; x <= 34; x++) px(buf, x, cy + 5, h); px(buf, 32, cy + 6, h); }
    if (adult && variant === "true") badge(buf, 32, cy - ry + 1);
    outline(buf, rm.out);
    face(buf, 32, cy - 2, mood, R(s * 0.4), teen ? 2 : 3);
  },

  // ---------- 墨影狐: fox ----------
  echo_fox(buf, rm0, variant, node, mood) {
    const rm = bodyRamp(rm0, variant), teen = node >= 3, adult = node >= 4;
    const sc = SCALE[node], f = FEAT[node];
    const s = R(16 * sc) - (variant === "swift" && teen ? 1 : 0), cy = 39 - R(s * 0.12);
    // --- tail(s) by variant ---
    if (variant === "ward" && teen) {
      const ft = (off) => { const ex = 32 + s + 6, ey = cy + 9 + off; stroke(buf, 32 + s - 2, cy + 4 + off / 2, ex, ey, 2, rm.sh); flame(buf, ex, ey + 2, 9); };
      if (adult) { ft(5); ft(-5); for (const [dx, dy] of [[-s - 4, -6], [s + 5, -9], [0, -s - 9]]) star(buf, 32 + dx, cy + dy, [255, 200, 110]); } else ft(0);
    } else if (variant === "swift" && teen) {
      const ex = 32 + s + 16, ey = cy - 3; stroke(buf, 32 + s - 2, cy + 5, ex - 3, ey + 1, 1, rm.sh); tri(buf, ex - 3, ey + 3, ex + 4, ey - 2, ex - 3, ey - 3, rm.base);
    } else if (variant === "plush" && teen) {
      const pl = (off) => { const ex = 32 + s + 6; stroke(buf, 32 + s - 3, cy + 4 + off / 2, ex, cy + 9 + off, 3, rm.sh); ball(buf, ex, cy + 9 + off, 4, rm); ball(buf, ex, cy + 9 + off, 2, ramp("#EADCF4")); };
      if (adult) { pl(5); pl(-5); } else pl(0);
    } else {
      const ex = 32 + s + R(7 * f) + 2; stroke(buf, 32 + s - 2, cy + 4, ex, cy + 9, adult ? 2 : 1, rm.sh); stroke(buf, 32 + s - 2, cy + 4, ex, cy + 8, 1, rm.base); ball(buf, ex, cy + 9, 2, ramp("#BFE9F2"));
    }
    // --- ears ---
    const eh = teen ? 11 : R(9 * f);
    if (variant === "swift" && teen) { tri(buf, 32 - s + 2, cy - s + 4, 32 - s - 5, cy - s + 4 - eh, 32 - 2, cy - s + 1, rm.sh); tri(buf, 32 + s - 2, cy - s + 4, 32 + s + 5, cy - s + 4 - eh, 32 + 2, cy - s + 1, rm.sh); }
    else { tri(buf, 32 - s + 2, cy - s + 3, 32 - s - 2, cy - s + 3 - eh, 32 - 4, cy - s + 1, rm.sh); tri(buf, 32 - s + 1, cy - s + 3, 32 - s, cy - s + 2 - eh, 32 - 5, cy - s, rm.base); tri(buf, 32 + s - 2, cy - s + 3, 32 + s + 2, cy - s + 3 - eh, 32 + 4, cy - s + 1, rm.sh); tri(buf, 32 + s - 1, cy - s + 3, 32 + s, cy - s + 2 - eh, 32 + 5, cy - s, rm.base); }
    // --- body ---
    ball(buf, 32, cy, s, rm);
    blob(buf, 32, cy + 4, R(s * 0.5), R(s * 0.4), tint(rm, [255, 255, 255], 0.28));
    if (variant === "plush" && teen) { blob(buf, 32 - s + 1, cy + 1, 4, 5, tint(rm, [255, 255, 255], 0.22)); blob(buf, 32 + s - 1, cy + 1, 4, 5, tint(rm, [255, 255, 255], 0.22)); }
    if (variant === "swift" && adult) for (let a = 0; a < 6; a++) px(buf, 32 + R(3 * Math.cos(-0.6 + a * 0.42)), cy - s + 2 + R(3 * Math.sin(-0.6 + a * 0.42)), [205, 222, 255]);
    if (adult && variant === "true") badge(buf, 32, cy - s + 3);
    outline(buf, rm.out);
    face(buf, 32, cy, mood, R(s * 0.38), teen ? 2 : 3); px(buf, 32, cy + 5, INK);
  },

  // ---------- 炸毛团: flame imp ----------
  ember_imp(buf, rm0, variant, node, mood) {
    const teen = node >= 3, adult = node >= 4;
    const rmBody = tint(rm0, [80, 42, 24], 0.32);
    const sc = SCALE[node], f = FEAT[node];
    const wide = variant === "brimimp" && teen ? 1.2 : 1.0;
    const s = R(15 * sc), cy = 40 - R(s * 0.1), rx = R(s * wide);
    const sulk = mood === "sulk";
    // --- flame hair by variant ---
    const fh = R(13 * (teen ? 1 : f));
    if (variant === "crackle" && teen) {
      // taller spikier flame + spark arcs + bolt
      const hot = sulk ? [255, 90, 50] : [255, 220, 90];
      tri(buf, 32 - 8, cy - s + 2, 32 - 10, cy - s - fh - 2, 32 - 1, cy - s, [235, 70, 20]);
      tri(buf, 32, cy - s + 2, 32 - 2, cy - s - fh - 6, 32 + 5, cy - s, hot);
      tri(buf, 32 + 8, cy - s + 2, 32 + 10, cy - s - fh - 2, 32 + 1, cy - s, [235, 70, 20]);
      for (const [x, y] of [[16, 20], [48, 16], [20, 12]]) { stroke(buf, x, y, x + 2, y + 3, 0, [255, 235, 90]); stroke(buf, x + 2, y + 3, x - 1, y + 6, 0, [255, 235, 90]); }
      if (adult) { stroke(buf, 50, 26, 53, 30, 0, [255, 240, 120]); stroke(buf, 53, 30, 50, 33, 0, [255, 240, 120]); }
    } else if (variant === "brimimp" && teen) {
      const hot = [255, 200, 90]; // droopy lazy flame
      tri(buf, 32 - 6, cy - s + 2, 32 - 9, cy - s - fh + 7, 32 - 1, cy - s, [225, 90, 35]);
      tri(buf, 32 + 6, cy - s + 2, 32 + 9, cy - s - fh + 7, 32 + 1, cy - s, [225, 90, 35]);
      tri(buf, 32, cy - s + 2, 32 + 2, cy - s - fh + 4, 32 + 4, cy - s, hot);
    } else {
      const hot = sulk ? [235, 40, 30] : [255, 195, 75];
      tri(buf, 32 - 7, cy - s + 2, 32 - 9, cy - s - fh + 5, 32 - 1, cy - s, [225, 70, 25]);
      tri(buf, 32, cy - s + 2, 32 - 2, cy - s - fh, 32 + 4, cy - s, hot);
      tri(buf, 32 + 7, cy - s + 2, 32 + 9, cy - s - fh + 5, 32 + 1, cy - s, [225, 70, 25]);
      tri(buf, 32 + 1, cy - s - 1, 32, cy - s - fh + 5, 32 + 3, cy - s, [255, 235, 130]);
    }
    // --- body ---
    blob(buf, 32, cy, rx, R(s * 1.04), rmBody);
    ball(buf, 32 - 6, cy + s - 2, 3, rm0); ball(buf, 32 + 6, cy + s - 2, 3, rm0); // feet
    if (variant === "brimimp" && teen) blob(buf, 32, cy + 3, R(rx * 0.55), R(s * 0.4), tint(rmBody, [255, 220, 170], 0.18)); // full belly
    // forge: chest core + body plates
    if (variant === "forge" && teen) {
      for (const py of [cy - 2, cy + 4]) for (let x = -rx + 2; x <= rx - 2; x += 1) if ((x + py) % 2 === 0) px(buf, 32 + x, py, tint(rmBody, [0, 0, 0], 0.25).sh); // plate seams
      ball(buf, 32, cy + 1, R(s * 0.3), ramp("#FF9838")); ball(buf, 32, cy + 1, R(s * 0.16), ramp("#FFE0A0"));
      if (adult) { for (const a of [0, 1, 2, 3]) star(buf, 32 + R((rx + 4) * Math.cos(a * 1.57)), cy + R((rx + 4) * Math.sin(a * 1.57)), [255, 200, 110]); }
    }
    if (adult && variant === "true") badge(buf, 32, cy + 1);
    outline(buf, rmBody.out);
    face(buf, 32, cy, mood, R(s * 0.36), teen ? 2 : 3);
  },

  // ---------- 探探芽: seed-sprout ----------
  sproutling(buf, rm0, variant, node, mood) {
    const rm = bodyRamp(rm0, variant), teen = node >= 3, adult = node >= 4;
    const sc = SCALE[node], f = FEAT[node];
    const lean = variant === "gust" && teen ? 0.86 : 1.0;
    const s = R(14 * sc), cy = 41 - R(s * 0.1), rx = R(s * lean);
    const bodyRm = tint(rm, [245, 240, 210], 0.26);
    // --- crown: stem + leaves (variant-flavored) ---
    const leaf = (sgn, len, col) => tri(buf, 32, cy - s - R(4 * f), 32 + sgn * R(len * f), cy - s - R(9 * f), 32 + sgn, cy - s - R((len + 5) * f), col);
    stroke(buf, 32, cy - s + 2, 32, cy - s - R(8 * f), 1, [90, 150, 70]);
    if (variant === "harvest" && teen) {
      leaf(-1, 11, [120, 200, 110]); leaf(1, 11, [145, 218, 122]); leaf(-1, 7, [110, 190, 100]); leaf(1, 7, [135, 205, 115]);
      ball(buf, 33, cy - s - R(11 * f), 2, ramp("#E23B5A")); if (adult) { ball(buf, 29, cy - s - R(8 * f), 2, ramp("#E23B5A")); ball(buf, 36, cy - s - R(8 * f), 2, ramp("#E23B5A")); }
    } else if (variant === "gust" && teen) {
      // leaf-wings on the sides + a floating seed
      tri(buf, 32 - rx, cy - 2, 32 - rx - R(11 * f), cy - 6, 32 - rx - 1, cy + 4, tint(rm, [255, 255, 255], 0.18).hi);
      tri(buf, 32 + rx, cy - 2, 32 + rx + R(11 * f), cy - 6, 32 + rx + 1, cy + 4, tint(rm, [255, 255, 255], 0.18).hi);
      leaf(0, 9, [150, 215, 125]);
      if (adult) { for (const [x, y] of [[14, 18], [50, 22], [18, 12]]) { ball(buf, x, y, 1, ramp("#EAF6D8")); for (let k = 1; k <= 3; k++) px(buf, x, y + k, [220, 235, 200], 180); } }
    } else if (variant === "dorm" && teen) {
      // stone shell cap + moss patches
      rrect(buf, 32, cy - R(s * 0.5), R(rx * 0.9), R(s * 0.62), 6, ramp("#9C8E7E"));
      for (const [dx, dy] of [[-4, -s], [3, -s + 2], [-2, -s + 4]]) px(buf, 32 + dx, cy + dy, [120, 170, 90]);
      if (adult) { stroke(buf, 32, cy - s - 1, 32, cy - s - 5, 0, [120, 170, 90]); ball(buf, 32, cy - s - 6, 2, ramp("#F4C6D8")); } // tiny flower
    } else {
      leaf(-1, 9, [120, 200, 110]); leaf(1, 9, [145, 218, 122]);
    }
    // --- body ---
    blob(buf, 32, cy, rx, R(s * 1.06), variant === "dorm" && teen ? ramp("#B9A98F") : bodyRm);
    if (adult && variant === "true") badge(buf, 32, cy + R(s * 0.4));
    outline(buf, (variant === "dorm" && teen ? ramp("#6B5E4C") : bodyRm).out);
    face(buf, 32, cy, mood === "happy" && variant === "dorm" ? "idle" : mood, R(s * 0.38), teen ? 2 : 3);
  },
};

// ---- egg + hide ----
function drawEgg(rm) {
  const buf = canvas(); shadow(buf, 56, 12);
  blob(buf, 32, 35, 16, 20, tint(rm, [255, 255, 255], 0.5));
  for (const [x, y] of [[26, 28], [38, 42], [30, 46], [40, 27]]) ball(buf, x, y, 2, rm);
  outline(buf, rm.out);
  return buf;
}
function drawHide(buf, rm) {
  ball(buf, 32, 41, 10, rm); face(buf, 32, 39, "idle", 4, 2); outline(buf, rm.out);
  const box = ramp("#8A7B72");
  for (let y = 46; y < 58; y++) for (let x = 13; x < 51; x++) px(buf, x, y, y < 49 ? box.hi : box.base);
  outline(buf, box.out);
}

function renderBuf(lineId, variant, stage, mood) {
  const rm = ramp(LINES[lineId].accent);
  if (stage === "egg") return drawEgg(rm);
  const buf = canvas(); shadow(buf);
  if (mood === "hide") { drawHide(buf, rm); return buf; }
  DRAW[lineId](buf, rm, variant, NODE[stage], mood);
  (FX[FXOF[mood]] || FX.none)(buf);
  return buf;
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
  }
}
if (isMain) {
  for (const [lineId, line] of Object.entries(LINES)) {
    if (only && lineId !== only) continue;
    // head folder = shared trunk (egg/baby/child) + the TRUE form (teen/adult)
    writeSet(join(OUT, lineId), lineId, "true", ["egg", "baby", "child", "teen", "adult"]);
    // each care branch = a within-lineage variant, teen+adult only
    for (const b of Object.values(line.branches)) {
      writeSet(join(OUT, `${lineId}__${b.variant}`), lineId, b.variant, ["teen", "adult"]);
    }
  }
  mkdirSync(join(OUT, "_fallback"), { recursive: true });
  writeFileSync(join(OUT, "_fallback", "blob.png"), render("mochi_pudding", "true", "child", "idle"));
  console.log(`rendered ${n} sprites${only ? " for " + only : " (4 lines)"}`);
}
