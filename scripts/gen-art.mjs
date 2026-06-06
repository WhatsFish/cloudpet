#!/usr/bin/env node
// Procedural pixel-art engine v2 (pure Node, built-in zlib). Cel-shaded
// (base+shadow+highlight + 1px tinted outline, single top-left light), 5 evolution
// stages with maturation (scale + feature growth + adult 本命 mark), mood/reaction
// poses + FX overlays. Renders to miniprogram/assets/pets/<id>/<stage>_<mood>.png.
//
// Usage: `node scripts/gen-art.mjs [creatureId]`  (no arg = all 10). Iterate on one.

import zlib from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "miniprogram/assets/pets");
const W = 64, H = 64;
const INK = [38, 30, 50];

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

// cel-shaded ball (3 tones by light from upper-left + specular pip)
function ball(buf, cx, cy, r, rm) {
  const lx = cx - r * 0.42, ly = cy - r * 0.42;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r) continue;
    const nl = 1 - Math.hypot(cx + dx - lx, cy + dy - ly) / (2 * r);
    px(buf, cx + dx, cy + dy, nl > 0.74 ? rm.hi : nl > 0.4 ? rm.base : rm.sh);
  }
  if (r >= 5) { px(buf, lx, ly, mix(rm.hi, [255, 255, 255], 0.5)); px(buf, lx + 1, ly, mix(rm.hi, [255, 255, 255], 0.3)); }
}
// cel-shaded ellipse (vertical light bands)
function blob(buf, cx, cy, rx, ry, rm) {
  for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
    if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) > 1) continue;
    const t = (dy + ry) / (2 * ry);
    px(buf, cx + dx, cy + dy, t < 0.28 && dx < rx * 0.3 ? rm.hi : t > 0.7 ? rm.sh : rm.base);
  }
}
function dome(buf, cx, cy, s, rm) { // upper hemisphere (jelly)
  const lx = cx - s * 0.42, ly = cy - s * 0.42;
  for (let dy = -s; dy <= Math.round(s * 0.28); dy++) for (let dx = -s; dx <= s; dx++) {
    if (dx * dx + dy * dy > s * s) continue;
    const nl = 1 - Math.hypot(cx + dx - lx, cy + dy - ly) / (2 * s);
    px(buf, cx + dx, cy + dy, nl > 0.74 ? rm.hi : nl > 0.4 ? rm.base : rm.sh);
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

// ---- face (expressive, eye shine) ----
function face(buf, cx, cy, mood, sp, eye = 2) {
  const lx = cx - sp, rx = cx + sp;
  const drawEye = (ex) => { for (let yy = -eye; yy <= eye; yy++) for (let xx = -(eye - 1); xx <= eye - 1; xx++) if (xx * xx / ((eye - 1) * (eye - 1) + 0.2) + yy * yy / (eye * eye) <= 1) px(buf, ex + xx, cy + yy, INK); px(buf, ex - 1, cy - 1, [255, 255, 255]); };
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
  sparkle(b) { for (const [x, y] of [[16, 14], [48, 18], [22, 9], [44, 36]]) { const c = [255, 240, 150]; px(b, x, y - 1, c); px(b, x, y + 1, c); px(b, x - 1, y, c); px(b, x + 1, y, c); px(b, x, y, [255, 255, 255]); } },
  zzz(b) { const c = [150, 170, 210]; const Z = (ox, oy, s) => { for (let i = 0; i < s; i++) px(b, ox + i, oy, c); for (let i = 0; i < s; i++) px(b, ox + s - 1 - i, oy + i, c); for (let i = 0; i < s; i++) px(b, ox + i, oy + s - 1, c); }; Z(44, 14, 3); Z(49, 9, 2); },
  bubbles(b) { for (const [x, y, r] of [[16, 18, 2], [47, 14, 2], [22, 11, 1]]) { for (let a = 0; a < 7; a++) px(b, x + Math.round(r * Math.cos(a)), y + Math.round(r * Math.sin(a)), [205, 238, 252], 210); px(b, x - 1, y - 1, [255, 255, 255], 220); } },
  notes(b) { const c = [120, 150, 230]; for (const [x, y] of [[16, 13], [47, 19]]) { for (let i = 0; i < 4; i++) px(b, x + 2, y - i, c); px(b, x, y, c); px(b, x + 1, y, c); px(b, x + 2, y + 1, c); } },
  anger(b) { const c = [230, 60, 50], x = 46, y = 13; px(b, x, y, c); px(b, x + 2, y, c); px(b, x + 1, y + 1, c); px(b, x, y + 2, c); px(b, x + 2, y + 2, c); },
  food(b) { const c = [210, 150, 90]; for (const [x, y] of [[20, 40], [44, 42], [16, 44]]) { px(b, x, y, c); px(b, x + 1, y, mix(c, [255, 255, 255], 0.3)); } },
  evolve(b) { for (let a = 0; a < 12; a++) px(b, 32 + Math.round(26 * Math.cos(a / 12 * 6.283)), 33 + Math.round(26 * Math.sin(a / 12 * 6.283)), [255, 240, 180]); FX.sparkle(b); },
  none() {},
};
const FXOF = { happy: "hearts", eating: "food", sleeping: "zzz", sulk: "anger", sad: "none", idle: "none", hide: "none" };

// ---- stages ----
const STAGES = {
  egg: { egg: true },
  baby: { scale: 0.66, feat: 0.45, eye: 3, faceY: -0.18 },
  child: { scale: 0.82, feat: 0.7, eye: 2, faceY: -0.12 },
  teen: { scale: 0.98, feat: 0.9, eye: 2, faceY: -0.05 },
  adult: { scale: 1.12, feat: 1.0, eye: 2, faceY: 0, badge: true },
};
const MOODS = ["idle", "happy", "sad", "sleeping", "sulk", "hide", "eating"];

// =================== BLUEPRINTS ===================
const R = Math.round;
const DRAW = {
  mochi_pudding(buf, rm, st, mood) {
    const s = R(15 * st.scale), cy = 40 - R(s * 0.1), f = st.feat;
    tri(buf, 32, cy - s - 5, 32 - 5, cy - s + 3, 32 + 5, cy - s + 3, rm.sh); // drip tip
    blob(buf, 32, cy, s, R(s * 1.12), rm);
    for (let i = 0; i < 3 + R(2 * f); i++) px(buf, 33 + i, cy - s - 3 - i, [230, 170, 90]); // 糖浆 curl
    if (mood !== "sleeping") { const h = [255, 120, 165]; px(buf, 31, cy + 3, h); px(buf, 33, cy + 3, h); px(buf, 30, cy + 4, h); px(buf, 34, cy + 4, h); for (let x = 30; x <= 34; x++) px(buf, x, cy + 5, h); px(buf, 32, cy + 6, h); px(buf, 32, cy + 7, h); }
    if (st.badge) badge(buf, 32, cy - s + 1);
    outline(buf, rm.out); face(buf, 32, cy + R(s * st.faceY) - 1, mood, R(s * 0.4), st.eye);
  },
  echo_fox(buf, rm, st, mood) {
    const s = R(16 * st.scale), cy = 39 - R(s * 0.12), f = st.feat;
    const tails = f > 0.85 ? [5, -4] : [1];
    for (const off of tails) { const ex = 32 + s + R(7 * f) + 2; stroke(buf, 32 + s - 2, cy + 4 + off / 2, ex, cy + 9 + off, 2, rm.sh); stroke(buf, 32 + s - 2, cy + 4 + off / 2, ex, cy + 8 + off, 1, rm.base); ball(buf, ex, cy + 9 + off, 2, ramp("#BFE9F2")); }
    const eh = R(9 * f);
    tri(buf, 32 - s + 2, cy - s + 3, 32 - s - 2, cy - s + 3 - eh, 32 - 4, cy - s + 1, rm.sh);
    tri(buf, 32 - s + 1, cy - s + 3, 32 - s, cy - s + 2 - eh, 32 - 5, cy - s, rm.base);
    tri(buf, 32 + s - 2, cy - s + 3, 32 + s + 2, cy - s + 3 - eh, 32 + 4, cy - s + 1, rm.sh);
    tri(buf, 32 + s - 1, cy - s + 3, 32 + s, cy - s + 2 - eh, 32 + 5, cy - s, rm.base);
    ball(buf, 32, cy, s, rm);
    blob(buf, 32, cy + 4, R(s * 0.5), R(s * 0.4), tint(rm, [255, 255, 255], 0.28));
    if (st.badge) badge(buf, 32, cy - s + 3);
    outline(buf, rm.out); face(buf, 32, cy + R(s * st.faceY), mood, R(s * 0.38), st.eye); px(buf, 32, cy + 5, INK);
  },
  ember_imp(buf, rm, st, mood) {
    const s = R(15 * st.scale), cy = 40 - R(s * 0.1), f = st.feat, fh = R(13 * f);
    const hi = mood === "sulk" ? [235, 40, 30] : [255, 195, 75];
    tri(buf, 32 - 7, cy - s + 2, 32 - 9, cy - s - fh + 5, 32 - 1, cy - s, [225, 70, 25]);
    tri(buf, 32, cy - s + 2, 32 - 2, cy - s - fh, 32 + 4, cy - s, hi);
    tri(buf, 32 + 7, cy - s + 2, 32 + 9, cy - s - fh + 5, 32 + 1, cy - s, [225, 70, 25]);
    tri(buf, 32 + 1, cy - s - 1, 32, cy - s - fh + 5, 32 + 3, cy - s, [255, 235, 130]);
    ball(buf, 32, cy, s, tint(rm, [80, 42, 24], 0.32));
    ball(buf, 32 - 6, cy + s - 2, 3, rm); ball(buf, 32 + 6, cy + s - 2, 3, rm);
    if (st.badge) badge(buf, 32, cy + 1);
    outline(buf, rm.out); face(buf, 32, cy + R(s * st.faceY), mood, R(s * 0.36), st.eye);
  },
  sproutling(buf, rm, st, mood) {
    const s = R(14 * st.scale), cy = 41 - R(s * 0.1), f = st.feat;
    stroke(buf, 32, cy - s + 2, 32, cy - s - R(8 * f), 1, [90, 150, 70]);
    tri(buf, 32, cy - s - R(4 * f), 32 - R(9 * f), cy - s - R(9 * f), 32 - 1, cy - s - R(14 * f), [120, 200, 110]);
    tri(buf, 32, cy - s - R(4 * f), 32 + R(9 * f), cy - s - R(9 * f), 32 + 1, cy - s - R(14 * f), [145, 218, 122]);
    blob(buf, 32, cy, s, R(s * 1.08), tint(rm, [245, 240, 210], 0.28));
    if (st.badge) badge(buf, 32, cy + R(s * 0.4));
    outline(buf, rm.out); face(buf, 32, cy + R(s * st.faceY), mood, R(s * 0.38), st.eye);
  },
  stone_egg(buf, rm, st, mood) {
    const s = R(17 * st.scale), cy = 40 - R(s * 0.08);
    blob(buf, 32, cy, s, R(s * 0.86), rm);
    for (const [dx, dy, r] of [[-7, -R(s * 0.9), 3], [0, -s - 1, 4], [7, -R(s * 0.9), 3]]) ball(buf, 32 + dx, cy + dy, R(r * Math.max(0.6, st.feat)), ramp("#6EA05A"));
    if (st.badge) badge(buf, 32, cy + R(s * 0.35));
    outline(buf, rm.out); face(buf, 32, cy + R(s * st.faceY), mood === "happy" ? "idle" : mood, R(s * 0.36), st.eye);
  },
  puff_seal(buf, rm, st, mood) {
    const s = R(17 * st.scale), cy = 40 - R(s * 0.08);
    blob(buf, 32 - s + 1, cy + 4, 5, 3, tint(rm, [255, 255, 255], 0.12)); blob(buf, 32 + s - 1, cy + 4, 5, 3, tint(rm, [255, 255, 255], 0.12));
    ball(buf, 32, cy, s, rm);
    blob(buf, 32, cy + 4, R(s * 0.5), R(s * 0.38), tint(rm, [255, 255, 255], 0.3));
    if (st.badge) badge(buf, 32, cy + R(s * 0.5));
    outline(buf, rm.out); face(buf, 32, cy + R(s * st.faceY), mood, R(s * 0.4), st.eye);
  },
  wisp_moth(buf, rm, st, mood) {
    const s = R(9 * st.scale), cy = 38 - R(s * 0.1), f = Math.max(0.6, st.feat), wing = tint(rm, [255, 245, 200], 0.4);
    blob(buf, 32 - s - 5, cy, R(7 * f), R(9 * f), wing); blob(buf, 32 + s + 5, cy, R(7 * f), R(9 * f), wing);
    ball(buf, 32, cy, s, tint(rm, [120, 100, 60], 0.18));
    stroke(buf, 32 - 2, cy - s - 1, 32 - 6, cy - s - 9, 1, INK); ball(buf, 32 - 6, cy - s - 9, 1, ramp("#FFD24A"));
    stroke(buf, 32 + 2, cy - s - 1, 32 + 6, cy - s - 9, 1, INK); ball(buf, 32 + 6, cy - s - 9, 1, ramp("#FFD24A"));
    ball(buf, 32, cy + s + 6, 2, ramp("#FFD24A"));
    if (st.badge) badge(buf, 32, cy);
    outline(buf, rm.out); face(buf, 32, cy, mood, Math.max(3, R(s * 0.5)), st.eye);
  },
  clay_golem(buf, rm, st, mood) {
    const hw = R(14 * st.scale), hh = R(15 * st.scale), cy = 38 - R(hh * 0.08);
    ball(buf, 32 - hw - 1, cy + 2, 3, rm); ball(buf, 32 + hw + 1, cy + 2, 3, rm);
    rrect(buf, 32, cy, hw, hh, 6, rm);
    ball(buf, 32, cy + R(hh * 0.4), 3, ramp("#FF9838"));
    if (st.badge) badge(buf, 32, cy - R(hh * 0.42));
    outline(buf, rm.out); face(buf, 32, cy - R(hh * 0.16), mood, R(hw * 0.42), st.eye);
  },
  spark_sprite(buf, rm, st, mood) {
    const s = R(13 * st.scale), cy = 41 - R(s * 0.1), f = st.feat;
    const Z = [[32 - 1, cy - s - 1], [32 + 4, cy - s - 5], [32 + 1, cy - s - 5], [32 + 5, cy - s - R(11 * f)]];
    for (let i = 0; i < Z.length - 1; i++) stroke(buf, Z[i][0], Z[i][1], Z[i + 1][0], Z[i + 1][1], 1, [255, 230, 90]);
    ball(buf, 32 - s - 1, cy - 3, 1, ramp("#FFEB78")); ball(buf, 32 + s + 1, cy + 2, 1, ramp("#FFEB78"));
    ball(buf, 32, cy, s, rm);
    if (st.badge) badge(buf, 32, cy + R(s * 0.45));
    outline(buf, rm.out); face(buf, 32, cy + R(s * st.faceY), mood, R(s * 0.38), st.eye);
  },
  dream_jelly(buf, rm, st, mood) {
    const s = R(17 * st.scale), cy = 35 - R(s * 0.04), tc = mix(rm.base, [255, 255, 255], 0.18);
    for (let i = -2; i <= 2; i++) { const x = 32 + i * R(s / 2.6); stroke(buf, x, cy + R(s * 0.2), x + (i % 2 ? 2 : -2), cy + R(s * 0.2) + 10, 1, tc); }
    dome(buf, 32, cy, s, rm);
    px(buf, 32 - 4, cy - 4, [255, 255, 255], 180); px(buf, 32 + 5, cy + 1, mix(rm.hi, [255, 255, 255], 0.4)); px(buf, 32 + 6, cy - 2, [255, 255, 255], 130);
    if (st.badge) badge(buf, 32, cy - R(s * 0.4));
    outline(buf, rm.out); face(buf, 32, cy, mood, R(s * 0.36), st.eye);
  },
};

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
function render(id, rm, stage, mood) {
  if (stage === "egg") return encode(drawEgg(rm));
  const buf = canvas(); shadow(buf);
  if (mood === "hide") { drawHide(buf, rm); return encode(buf); }
  DRAW[id](buf, rm, STAGES[stage], mood);
  (FX[FXOF[mood]] || FX.none)(buf);
  return encode(buf);
}

// ---- PNG ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++)c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++)c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length, 0); const b = Buffer.concat([Buffer.from(t, "ascii"), d]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(b), 0); return Buffer.concat([l, b, cr]); };
function encode(rgba) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(rgba.buffer).copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const ACCENTS = {
  mochi_pudding: "#FF9EC4", echo_fox: "#5B4B8A", ember_imp: "#FF6B2C",
  sproutling: "#7FB069", stone_egg: "#9C8B7A", puff_seal: "#FFB6CE",
  wisp_moth: "#F2C94C", clay_golem: "#C97B5A", spark_sprite: "#56CCF2",
  dream_jelly: "#B39DDB",
};
const only = process.argv[2];
let n = 0;
for (const [id, hex] of Object.entries(ACCENTS)) {
  if (only && id !== only) continue;
  const rm = ramp(hex), dir = join(OUT, id); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "egg.png"), render(id, rm, "egg", "idle")); n++;
  for (const stage of ["baby", "child", "teen", "adult"]) for (const mood of MOODS) { writeFileSync(join(dir, `${stage}_${mood}.png`), render(id, rm, stage, mood)); n++; }
}
mkdirSync(join(OUT, "_fallback"), { recursive: true });
writeFileSync(join(OUT, "_fallback", "blob.png"), render("mochi_pudding", ramp("#C9C9D6"), "child", "idle"));
console.log(`rendered ${n} sprites${only ? " for " + only : " (all 10)"}`);
