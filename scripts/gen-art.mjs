#!/usr/bin/env node
// Procedural pixel-art engine v8 — SIX distinct creatures, one per design language
// (奶团 puff / 克劳德 claude / 方头崽 blocky / 波波企鹅 penguin / 墩墩熊 bear / 团团海豹 seal).
// Flat fills, soft outline, big silly eyes — 蠢萌. penguin/bear/seal's 3 teen forms are REAL
// related species (帝企鹅/跳岩/加拉帕戈斯, 棕熊/北极熊/熊猫, 竖琴海豹/象海豹/豹海豹), distinct by
// colour + silhouette. Each creature: size by stage, its 3 named variant forms, the 7 moods,
// and activity poses (feed/clean/play). Same
// interface (renderBuf/exports/main-loop/sprite paths) so the pipeline is unchanged.
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

const PAL = {
  puff: { body: hx("#FBE0C2"), ink: hx("#6A5A6E"), cheek: hx("#F6AEBE"), deco: hx("#F2A0B4") },
  claude: { body: hx("#D96A4A"), leg: hx("#BE5536"), ink: hx("#2C2C32"), cheek: hx("#E98C70"), deco: hx("#7FBE9E") },
  blocky: { body: hx("#A9C27E"), ink: hx("#37432A"), cheek: hx("#8AA862"), deco: hx("#E8845B") },
  penguin: { body: hx("#6F8DA9"), belly: hx("#FAFBFC"), beak: hx("#F2A23C"), ink: hx("#39465A"), cheek: hx("#F3B5BE"), foot: hx("#EF9A2E"), deco: hx("#F2A0B4") },
  bear: { body: hx("#2E2E3A"), muzzle: hx("#F2E8D8"), ink: hx("#16161E"), cheek: hx("#E23838"), deco: hx("#F2A03C") },
  seal: { body: hx("#9FB4C2"), belly: hx("#E7EDF1"), ink: hx("#3A4750"), cheek: hx("#F3B5BE"), foot: hx("#8AA0AE"), deco: hx("#74909F") },
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
function note(b, x, y, c) { for (let i = 0; i < 4; i++) px(b, x + 2, y - i, c); px(b, x, y, c); px(b, x + 1, y, c); px(b, x + 2, y + 1, c); }
function blush2(b, cx, cy, c) { for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) px(b, cx + xx, cy + yy, c); }

// small dark eyes with expression (puff/claude/penguin/blocky-base)
function eyesDark(b, cy, ex, mood, ink, r = 1) {
  for (const e of [-ex, ex]) {
    if (mood === "happy" || mood === "eating") { px(b, 32 + e - 1, cy + 1, ink); px(b, 32 + e, cy, ink); px(b, 32 + e + 1, cy + 1, ink); }
    else if (mood === "sleeping") { px(b, 32 + e - 1, cy, ink); px(b, 32 + e, cy + 1, ink); px(b, 32 + e + 1, cy, ink); }
    else if (mood === "sad") { px(b, 32 + e - 1, cy, ink); px(b, 32 + e, cy + 1, ink); px(b, 32 + e + 1, cy, ink); }
    else if (mood === "sulk") { px(b, 32 + e - 1, cy - 1, ink); px(b, 32 + e, cy - 1, ink); px(b, 32 + e + 1, cy, ink); }
    else for (let yy = 0; yy < 2 + r; yy++) for (let xx = 0; xx <= r; xx++) px(b, 32 + e + xx, cy - 1 + yy, ink);
  }
}
// big white eyes + pupil (bear)
function eyesBig(b, cy, ex, mood, ink, er = 4) {
  for (const e of [-ex, ex]) {
    if (mood === "happy" || mood === "eating") { for (let i = -2; i <= 2; i++) px(b, 32 + e + i, cy + Math.abs(i) - 1, ink); continue; }
    if (mood === "sleeping") { for (let i = -2; i <= 2; i++) px(b, 32 + e + i, cy, ink); continue; }
    disc(b, 32 + e, cy, er, [255, 255, 255]);
    const py = mood === "sad" ? cy + 1 : cy;
    disc(b, 32 + e, py, 2, ink); px(b, 32 + e - 1, py - 2, [255, 255, 255]);
  }
}
// googly mismatched (blocky)
function eyesGoogly(b, cy, ink) {
  disc(b, 32 - 5, cy - 1, 4, [255, 255, 255]); disc(b, 32 + 6, cy, 3, [255, 255, 255]);
  disc(b, 32 - 5, cy, 2, ink); disc(b, 32 + 6, cy, 1, ink);
}

function floatExtras(b, box, mood) {
  const { cy, hw, hh, ex } = box;
  if (mood === "happy") { heart(b, 32 - hw - 3, cy - 3, [240, 120, 150]); heart(b, 32 + hw, cy - 6, [240, 120, 150]); }
  if (mood === "eating") { rrect(b, 32, cy + hh + 3, 5, 2, 1, [150, 118, 80]); disc(b, 32, cy + hh + 2, 1, [240, 184, 92]); }
  if (mood === "sleeping") { const Z = (ox, oy, s) => { for (let i = 0; i < s; i++) { px(b, ox + i, oy, [150, 168, 208]); px(b, ox + s - 1 - i, oy + i, [150, 168, 208]); px(b, ox + i, oy + s - 1, [150, 168, 208]); } }; Z(32 + hw, cy - hh, 3); Z(32 + hw + 5, cy - hh - 5, 2); }
  if (mood === "sulk") { const c = [230, 80, 60], x = 32 + hw, y = cy - hh + 2; px(b, x, y, c); px(b, x + 2, y, c); px(b, x + 1, y + 1, c); px(b, x, y + 2, c); px(b, x + 2, y + 2, c); }
  if (mood === "sad") { px(b, 32 + ex, cy + 2, [120, 180, 230]); px(b, 32 + ex, cy + 3, [120, 180, 230]); }
}
function actProp(b, box, act) {
  const { cy, hw, hh } = box, dark = [60, 62, 72];
  if (act === "feed") { stroke(b, 32 + hw, cy + 3, 32 + hw + 7, cy + 2, 1, [120, 92, 64]); ell(b, 32 + hw + 11, cy + 3, 4, 2, dark); disc(b, 32 + hw + 11, cy + 2, 1, [240, 184, 92]); }
  else if (act === "clean") { rrect(b, 32, cy + hh + 1, hw, 3, 2, [156, 120, 80]); for (const [dx, dy] of [[-hw + 2, -hh + 1], [hw - 2, -hh + 4], [-3, -hh - 3], [5, -hh - 1]]) { disc(b, 32 + dx, cy + dy, 2, [232, 244, 252]); px(b, 32 + dx - 1, cy + dy - 1, [255, 255, 255]); } }
  else if (act === "play") { rrect(b, 32, cy + hh + 3, 7, 3, 2, [86, 90, 104]); px(b, 32 - 3, cy + hh + 3, [232, 96, 96]); px(b, 32 + 3, cy + hh + 2, [96, 164, 232]); }
}

const SCALE = [0, 0.74, 0.86, 0.96, 1.06];
const stub = (b, x, y, c) => rrect(b, x, y, 2, 3, 1, c);

// =================== 5 CREATURES ===================
// each returns the face box { cy, hw, hh, ex }
const DRAW = {
  puff(b, variant, node, mood) {
    const P = PAL.puff, sc = SCALE[node];
    let r = R(16 * sc), cy = 37 - R(r * 0.1);
    if (variant === "round") r = R(r * 1.12);
    const top = cy - r;
    if (variant === "bunny") { ell(b, 32 - 5, top - 4, 3, 7, P.body); ell(b, 32 + 5, top - 4, 3, 7, P.body); }
    if (variant === "horn") tri(b, 32, top - 8, 32 - 3, top + 1, 32 + 3, top + 1, P.deco);
    if (node >= 3) { stub(b, 32 - 6, cy + r - 1, P.body); stub(b, 32 + 6, cy + r - 1, P.body); }
    disc(b, 32, cy, r, P.body);
    if (variant === "round") { disc(b, 30, top - 1, 2, [226, 64, 90]); stroke(b, 30, top - 2, 31, top - 5, 0, [120, 170, 70]); }
    outline(b, P.ink);
    const ex = R(r * 0.42);
    eyesDark(b, cy, ex, mood, P.ink, 1);
    if (mood !== "sad" && mood !== "sulk") { blush2(b, 32 - ex - 3, cy + 3, P.cheek); blush2(b, 32 + ex + 2, cy + 3, P.cheek); }
    px(b, 32, cy + 5, P.ink); px(b, 31, cy + 6, P.ink); px(b, 33, cy + 6, P.ink);
    return { cy, hw: r, hh: r, ex };
  },
  claude(b, variant, node, mood) {
    const P = PAL.claude, sc = SCALE[node];
    let hw = R(14 * sc), hh = R(11 * sc), cy = 34;
    if (variant === "round") { hw = R(hw * 1.16); hh = R(hh * 1.1); }
    const top = cy - hh;
    if (variant === "curl") { stroke(b, 32, top + 1, 32 + 4, top - 6, 1, P.body); disc(b, 32 + 4, top - 6, 2, P.deco); }
    if (variant === "ears") { disc(b, 32 - hw + 3, top + 1, 3, P.body); disc(b, 32 + hw - 3, top + 1, 3, P.body); }
    for (const lx of [-hw + 3, -R(hw * 0.32), R(hw * 0.32), hw - 3]) stub(b, 32 + lx, cy + hh + 2, P.leg);
    rrect(b, 32, cy, hw, hh, 5, P.body);
    outline(b, P.leg);
    const ex = Math.max(5, R(hw * 0.44));
    eyesDark(b, cy, ex, mood, P.ink, 1);
    if (mood !== "sad" && mood !== "sulk") { blush2(b, 32 - hw + 2, cy + 2, P.cheek); blush2(b, 32 + hw - 3, cy + 2, P.cheek); }
    return { cy, hw, hh, ex };
  },
  blocky(b, variant, node, mood) {
    const P = PAL.blocky, sc = SCALE[node];
    let hw = R(13 * sc), hh = R(14 * sc), cy = 33;
    if (variant === "round") { hw = R(hw * 1.18); hh = R(hh * 0.92); }
    const top = cy - hh;
    if (variant === "antenna") { stroke(b, 32, top, 32, top - 7, 1, P.ink); disc(b, 32, top - 8, 2, P.deco); }
    if (variant === "wing") { tri(b, 32 - hw, cy, 32 - hw - 8, cy - 4, 32 - hw - 2, cy + 6, P.body); tri(b, 32 + hw, cy, 32 + hw + 8, cy - 4, 32 + hw + 2, cy + 6, P.body); }
    rrect(b, 32, cy, hw, hh, 4, P.body);
    if (node >= 2) { rrect(b, 32 - 6, cy + hh, 3, 3, 1, P.body); rrect(b, 32 + 6, cy + hh, 3, 3, 1, P.body); }
    outline(b, P.ink, 2);
    if (mood === "happy" || mood === "eating" || mood === "sleeping") eyesDark(b, cy - 1, 6, mood, P.ink, 1); else eyesGoogly(b, cy - 1, P.ink);
    rrect(b, 32, cy + 6, 4, 2, 1, P.deco); px(b, 32, cy + 6, P.ink); // beak
    return { cy, hw, hh, ex: 6 };
  },
  penguin(b, variant, node, mood) {
    const P = PAL.penguin, sc = SCALE[node];
    let rx = R(13 * sc), ry = R(16 * sc), cy = 33;
    if (variant === "emperor") ry = R(ry * 1.12);                         // tall, regal
    if (variant === "galapagos") { rx = R(rx * 0.86); ry = R(ry * 0.9); } // dainty
    const ex = R(rx * 0.36), eyeCy = cy - 3;
    ell(b, 32 - 5, cy + ry, 3, 2, P.foot); ell(b, 32 + 5, cy + ry, 3, 2, P.foot);
    ell(b, 32, cy, rx, ry, P.body);
    ell(b, 32 - rx, cy + 3, 2, 6, P.body); ell(b, 32 + rx, cy + 3, 2, 6, P.body);
    ell(b, 32, cy + 4, rx - 2, ry - 4, P.belly);
    if (variant === "emperor") { // orange ear patches + golden upper-chest (帝企鹅标志)
      const orange = hx("#F2A23C"), yel = hx("#F7D86B");
      ell(b, 32 - rx + 1, eyeCy + 1, 2, 4, orange); ell(b, 32 + rx - 1, eyeCy + 1, 2, 4, orange);
      ell(b, 32, cy + 6, rx - 4, 3, yel);
    }
    if (variant === "rockhopper") { // yellow spiky eyebrow crest flaring up-and-back
      const yel = hx("#F2C53D");
      for (const s of [-1, 1]) {
        stroke(b, 32 + s * (ex + 1), eyeCy - 2, 32 + s * (rx + 1), cy - ry - 1, 0, yel);
        stroke(b, 32 + s * (ex + 2), eyeCy - 1, 32 + s * (rx + 3), cy - ry + 1, 0, yel);
        stroke(b, 32 + s * (ex + 3), eyeCy, 32 + s * (rx + 4), cy - ry + 5, 0, yel);
      }
    }
    if (variant === "galapagos") // thin white face stripe curving around the cheek
      for (const s of [-1, 1]) stroke(b, 32 + s * 2, cy - ry + 3, 32 + s * (rx - 1), cy + 4, 0, [255, 255, 255]);
    outline(b, P.ink);
    eyesDark(b, eyeCy, ex, mood, variant === "rockhopper" ? hx("#C0392B") : P.ink, 0);
    tri(b, 32, cy + 1, 32 - 3, cy + 4, 32 + 3, cy + 4, P.beak); px(b, 32, cy + 4, P.ink);
    if (mood !== "sad" && mood !== "sulk") { blush2(b, 32 - rx + 1, cy + 1, P.cheek); blush2(b, 32 + rx - 2, cy + 1, P.cheek); }
    return { cy, hw: rx, hh: ry, ex };
  },
  bear(b, variant, node, mood) {
    const sc = SCALE[node], ink = PAL.bear.ink;
    // real bear species: 墩墩(本·黑) / 棕熊崽 / 北极熊崽(白) / 熊猫崽(黑白眼圈). colour + eyes differ.
    const C = ({
      true:  { body: hx("#2E2E3A"), muzzle: hx("#F2E8D8"), ear: hx("#2E2E3A"), cheek: hx("#E23838"), patch: null,            smallEye: false },
      brown: { body: hx("#A9774B"), muzzle: hx("#E9D2B0"), ear: hx("#8A5E38"), cheek: hx("#E07A5F"), patch: null,            smallEye: false },
      polar: { body: hx("#EBEEF2"), muzzle: hx("#FBFCFD"), ear: hx("#D8DEE6"), cheek: null,          patch: null,            smallEye: true  },
      panda: { body: hx("#F4F4F2"), muzzle: hx("#F4F4F2"), ear: hx("#22232A"), cheek: null,          patch: hx("#22232A"),   smallEye: false },
    })[variant] || { body: hx("#2E2E3A"), muzzle: hx("#F2E8D8"), ear: hx("#2E2E3A"), cheek: hx("#E23838"), patch: null, smallEye: false };
    let r = R(15 * sc), cy = 36 - R(r * 0.1);
    if (variant === "brown") r = R(r * 1.08);
    const er = 5;
    disc(b, 32 - r + 2, cy - r + 2, er, C.ear); disc(b, 32 + r - 2, cy - r + 2, er, C.ear);
    if (node >= 3) { disc(b, 32 - 6, cy + r - 1, 3, C.body); disc(b, 32 + 6, cy + r - 1, 3, C.body); }
    disc(b, 32, cy, r, C.body);
    const ex = R(r * 0.42), eyeR = node === 1 ? 3 : 4;
    if (C.patch) { ell(b, 32 - ex, cy - 1, 3, 4, C.patch); ell(b, 32 + ex, cy - 1, 3, 4, C.patch); } // panda eye rings
    outline(b, ink);
    if (C.smallEye) eyesDark(b, cy - 1, ex, mood, ink, 1);                  // polar: small dark eyes on white
    else eyesBig(b, cy - 1, ex, mood, ink, C.patch ? 3 : eyeR);            // 本/棕/熊猫: big eyes (panda inside rings)
    if (C.cheek) { disc(b, 32 - r + 2, cy + 4, 3, C.cheek); disc(b, 32 + r - 2, cy + 4, 3, C.cheek); }
    ell(b, 32, cy + 6, 4, 3, C.muzzle);
    px(b, 32, cy + 4, ink); px(b, 31, cy + 7, ink); px(b, 32, cy + 8, ink); px(b, 33, cy + 7, ink);
    return { cy, hw: r, hh: r, ex };
  },
  seal(b, variant, node, mood) {
    const sc = SCALE[node], ink = hx("#3A4750");
    // 团团(本·灰白斑) / 雪团(竖琴海豹宝宝·白绒大眼) / 阔鼻(象海豹·大鼻) / 豹斑(豹海豹·深色流线).
    const C = ({
      true:     { body: hx("#9FB4C2"), belly: hx("#E7EDF1"), flip: hx("#8AA0AE"), spot: hx("#74909F") },
      harp:     { body: hx("#F1F3F5"), belly: hx("#FBFCFD"), flip: hx("#E0E5EA"), spot: null },
      elephant: { body: hx("#8E8C86"), belly: hx("#CBC9C2"), flip: hx("#7C7A74"), spot: null },
      leopard:  { body: hx("#56697A"), belly: hx("#93A8B6"), flip: hx("#48596A"), spot: hx("#36434F") },
    })[variant] || { body: hx("#9FB4C2"), belly: hx("#E7EDF1"), flip: hx("#8AA0AE"), spot: hx("#74909F") };
    let rx = R(14 * sc), ry = R(15 * sc), cy = 35;
    if (variant === "harp") rx = R(rx * 1.04);
    if (variant === "leopard") { rx = R(rx * 0.92); ry = R(ry * 1.06); }   // sleeker
    ell(b, 32, cy + ry - 1, 6, 3, C.flip);                                  // tail flippers
    ell(b, 32, cy, rx, ry, C.body);                                         // round body
    ell(b, 32, cy + 5, rx - 3, ry - 5, C.belly);                            // pale belly
    ell(b, 32 - rx + 1, cy + ry - 6, 3, 5, C.flip); ell(b, 32 + rx - 1, cy + ry - 6, 3, 5, C.flip); // front flippers
    if (C.spot) for (const [dx, dy] of [[-6, -5], [5, -7], [-4, 2], [7, 2], [1, -9], [-8, -1]]) blush2(b, 32 + dx, cy + dy, C.spot);
    if (variant === "elephant") ell(b, 32, cy + 4, 3, 5, mix(C.body, [0, 0, 0], 0.16)); // big droopy proboscis
    outline(b, ink);
    const ex = R(rx * 0.4), er = variant === "harp" ? 3 : 2, eyeCy = cy - 2; // big glossy eyes (harp pup = bigger)
    for (const e of [-ex, ex]) {
      if (mood === "happy" || mood === "eating") { for (let i = -1; i <= 1; i++) px(b, 32 + e + i, eyeCy + Math.abs(i), ink); }
      else if (mood === "sleeping") { px(b, 32 + e - 1, eyeCy, ink); px(b, 32 + e, eyeCy + 1, ink); px(b, 32 + e + 1, eyeCy, ink); }
      else if (mood === "sulk") { px(b, 32 + e - 1, eyeCy - 1, ink); px(b, 32 + e, eyeCy - 1, ink); px(b, 32 + e + 1, eyeCy, ink); }
      else if (mood === "sad") disc(b, 32 + e, eyeCy + 1, er, ink);
      else { disc(b, 32 + e, eyeCy, er, ink); px(b, 32 + e - 1, eyeCy - 1, [255, 255, 255]); }
    }
    if (variant !== "elephant") { px(b, 31, cy + 3, ink); px(b, 32, cy + 3, ink); px(b, 33, cy + 3, ink); } else { px(b, 31, cy + 8, ink); px(b, 32, cy + 8, ink); } // nose (elephant: at tip of proboscis)
    for (const s of [-1, 1]) { px(b, 32 + s * 5, cy + 4, ink); px(b, 32 + s * 7, cy + 3, ink); px(b, 32 + s * 7, cy + 5, ink); } // whiskers
    if (mood !== "sad" && mood !== "sulk") { blush2(b, 32 - rx + 2, cy + 2, hx("#F3B5BE")); blush2(b, 32 + rx - 3, cy + 2, hx("#F3B5BE")); }
    return { cy, hw: rx, hh: ry, ex };
  },
};

function drawHide(b, P) {
  rrect(b, 32, 30, 8, 6, 3, P.body); outline(b, P.leg || P.ink); eyesDark(b, 29, 4, "idle", P.ink, 0);
  rrect(b, 32, 47, 18, 8, 3, [150, 120, 86]); rrect(b, 32, 43, 18, 1, 0, [120, 95, 66]);
}
function drawEgg(b, body) {
  shadow(b, 56, 12);
  ell(b, 32, 35, 15, 19, mix(body, [255, 255, 255], 0.5));
  for (const [x, y] of [[26, 28], [38, 42], [30, 46], [40, 27]]) disc(b, x, y, 2, body);
  outline(b, mix(body, [0, 0, 0], 0.4));
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
  floatExtras(b, box, eyeMood);
  if (ACTS.includes(mood)) actProp(b, box, mood);
  return b;
}
function render(lineId, variant, stage, mood) { return encode(renderBuf(lineId, variant, stage, mood)); }

export { renderBuf, encode, LINES, W, H };
// raster toolkit + head anchors — reused by the decoration engine (scripts/gen-deco.mjs) so
// hats are drawn with the SAME primitives and placed on each creature's real head-top.
export { canvas, px, disc, ell, rrect, tri, stroke, NODE, PAL };

// Head-top anchor for a decoration (hat) in 64-canvas coords: the row where a hat's contact
// line should sit, derived from each creature's face box (top of head ≈ cy - hh). Lets the deco
// engine + client place hats per (species, stage) with no hand-tuned constants. egg → fixed top.
export function headAnchor(lineId, variant, stage) {
  if (stage === "egg") return { x: 32, y: 16 };
  const box = DRAW[lineId](canvas(), variant, NODE[stage], "idle");
  return { x: 32, y: box.cy - box.hh };
}

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
