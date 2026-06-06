#!/usr/bin/env node
// Device-shell MOCKUPS (design reference, not game assets). Renders the Tamagotchi-
// style cloudpet handheld in 2 shapes (egg / square) × retro palettes, with a color
// pixel pet on a tinted LCD (scanlines + pixel grid), icon menu, Lv + evolution bar,
// and 3 buttons (A/B/C). Output: docs/mockups/<shape>_<palette>.png
// Run: node scripts/gen-mockup.mjs

import zlib from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/mockups");
mkdirSync(OUT, { recursive: true });
const W = 300, H = 470;

// ---- color ----
const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const dark = (c, f) => c.map((v) => Math.round(v * f));

// ---- raster ----
function canvas() { return new Uint8ClampedArray(W * H * 4); }
function px(buf, x, y, c, a = 255) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; const ia = a / 255, ib = 1 - ia; buf[i] = c[0] * ia + buf[i] * ib; buf[i + 1] = c[1] * ia + buf[i + 1] * ib; buf[i + 2] = c[2] * ia + buf[i + 2] * ib; buf[i + 3] = Math.max(buf[i + 3], a); }
function rect(buf, x, y, w, h, c, a = 255) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(buf, x + i, y + j, c, a); }
function ell(buf, cx, cy, rx, ry, c, a = 255) { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) px(buf, cx + x, cy + y, c, a); }
function disc(buf, cx, cy, r, c, a = 255) { ell(buf, cx, cy, r, r, c, a); }
function rrect(buf, x, y, w, h, r, c, a = 255) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const ox = Math.max(0, Math.max(r - i, i - (w - 1 - r))), oy = Math.max(0, Math.max(r - j, j - (h - 1 - r))); if (ox * ox + oy * oy <= r * r) px(buf, x + i, y + j, c, a); } }
function rstroke(buf, x, y, w, h, r, t, c) { for (let k = 0; k < t; k++) { const pts = []; for (let i = 0; i < w; i++) { pts.push([x + i, y + k]); pts.push([x + i, y + h - 1 - k]); } for (let j = 0; j < h; j++) { pts.push([x + k, y + j]); pts.push([x + w - 1 - k, y + j]); } for (const [a, b] of pts) { const ox = Math.max(0, Math.max(r - (a - x), (a - x) - (w - 1 - r))), oy = Math.max(0, Math.max(r - (b - y), (b - y) - (h - 1 - r))); if (ox * ox + oy * oy <= r * r && ox * ox + oy * oy >= (r - t) * (r - t)) px(buf, a, b, c); } } }

// ---- 3x5 pixel font ----
const FONT = { A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111", L: "100100100100111", O: "010101101101010", P: "110101110100100", T: "111010010010010", U: "101101101101011", V: "101101101010010", N: "101111111101101", H: "101101111101101", S: "011100010001110", " ": "000000000000000" };
const DIG = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001010010010", "111101111101111", "111101111001111"];
function glyph(ch) { if (ch >= "0" && ch <= "9") return DIG[+ch]; return FONT[ch] || FONT[" "]; }
function text(buf, x, y, str, s, c) { let cx = x; for (const ch of str.toUpperCase()) { const g = glyph(ch); for (let r = 0; r < 5; r++) for (let col = 0; col < 3; col++) if (g[r * 3 + col] === "1") rect(buf, cx + col * s, y + r * s, s, s, c); cx += 4 * s; } }
const textW = (str, s) => str.length * 4 * s - s;

// ---- icon glyphs (≈18px) ----
const I = {
  food(b, x, y, c) { for (let i = -7; i <= 7; i++) for (let j = 0; j <= 6; j++) if ((i * i) / 49 + ((j - 6) * (j - 6)) / 36 <= 1 && j >= 0) px(b, x + i, y + j, c); rect(b, x - 8, y - 1, 16, 2, c); disc(b, x - 3, y - 4, 1, c); disc(b, x + 2, y - 5, 1, c); disc(b, x + 4, y - 3, 1, c); },
  bath(b, x, y, c) { for (let j = -8; j <= 6; j++) { const w = j < 0 ? 1 + (j + 8) * 0.4 : 6; for (let i = -w; i <= w; i++) px(b, x + i, y + j, c); } px(b, x - 2, y - 2, [255, 255, 255], 200); },
  play(b, x, y, c) { rrect(b, x - 9, y - 5, 18, 11, 4, c); px(b, x - 4, y, [255, 255, 255]); px(b, x - 5, y - 1, [255, 255, 255]); px(b, x - 5, y + 1, [255, 255, 255]); px(b, x - 6, y, [255, 255, 255]); disc(b, x + 4, y - 1, 1, [255, 255, 255]); disc(b, x + 6, y + 1, 1, [255, 255, 255]); },
  med(b, x, y, c) { for (let k = 0; k < 14; k++) { const t = k / 13, px2 = x - 6 + 12 * t, py = y - 6 + 12 * t; disc(b, px2, py, 4, c); } disc(b, x - 3, y - 3, 4, mix(c, [255, 255, 255], 0.5)); },
  status(b, x, y, c) { rect(b, x - 7, y + 4, 4, 2, c); rect(b, x - 2, y - 1, 4, 7, c); rect(b, x + 3, y - 6, 4, 12, c); },
  heart(b, x, y, c) { for (let j = 0; j < 12; j++) for (let i = -7; i <= 7; i++) { const t = j / 11; const w = j < 4 ? 0 : (j - 3); const lobeL = Math.hypot(i + 3, j - 3) <= 4, lobeR = Math.hypot(i - 3, j - 3) <= 4, body = Math.abs(i) <= 7 - j * 0.9 && j >= 3; if (lobeL || lobeR || body) px(b, x + i, y + j - 6, c); } },
  moon(b, x, y, c) { disc(b, x, y, 8, c); disc(b, x + 4, y - 2, 7, [0, 0, 0, 0], 0); for (let yy = -8; yy <= 8; yy++) for (let xx = -8; xx <= 8; xx++) { if (xx * xx + yy * yy <= 64 && (xx - 4) * (xx - 4) + (yy + 2) * (yy + 2) > 49) px(b, x + xx, y + yy, c); } },
  egg(b, x, y, c) { ell(b, x, y, 6, 8, c); px(b, x - 2, y - 2, [255, 255, 255], 160); },
  gear(b, x, y, c) { disc(b, x, y, 6, c); for (let a = 0; a < 8; a++) disc(b, x + Math.round(8 * Math.cos(a / 8 * 6.28)), y + Math.round(8 * Math.sin(a / 8 * 6.28)), 2, c); disc(b, x, y, 2, [0, 0, 0, 0], 0); },
};

// ---- a colorful sample pet on the LCD (cel-shaded) ----
function ball(b, cx, cy, r, base) { const hi = mix(base, [255, 255, 255], 0.4), sh = dark(base, 0.7), lx = cx - r * 0.4, ly = cy - r * 0.4; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dy * dy > r * r) continue; const nl = 1 - Math.hypot(cx + dx - lx, cy + dy - ly) / (2 * r); px(b, cx + dx, cy + dy, nl > 0.74 ? hi : nl > 0.4 ? base : sh); } px(b, lx, ly, [255, 255, 255], 220); }
function tri(b, ax, ay, bx, by, cx, cy, c) { const mnx = Math.min(ax, bx, cx), mxx = Math.max(ax, bx, cx), mny = Math.min(ay, by, cy), mxy = Math.max(ay, by, cy); for (let y = mny; y <= mxy; y++) for (let x = mnx; x <= mxx; x++) { const w0 = (bx - ax) * (y - ay) - (by - ay) * (x - ax), w1 = (cx - bx) * (y - by) - (cy - by) * (x - bx), w2 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx); if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) px(b, x, y, c); } }
function petOnScreen(b, cx, cy, body, ink) {
  const r = 22;
  tri(b, cx - r + 4, cy - r + 6, cx - r - 2, cy - r - 10, cx - 6, cy - r + 2, dark(body, 0.7));
  tri(b, cx + r - 4, cy - r + 6, cx + r + 2, cy - r - 10, cx + 6, cy - r + 2, dark(body, 0.7)); // ears
  ball(b, cx, cy, r, body);
  disc(b, cx, cy + 6, 8, mix(body, [255, 255, 255], 0.3)); // muzzle
  // happy face
  for (const ex of [cx - 8, cx + 8]) { px(b, ex - 1, cy - 2, ink); px(b, ex, cy - 3, ink); px(b, ex + 1, cy - 2, ink); px(b, ex, cy - 1, ink); }
  for (let x = -4; x <= 4; x++) px(b, cx + x, cy + 6 + (Math.abs(x) === 4 ? -1 : 0), ink);
  disc(b, cx - 11, cy + 2, 2, [255, 150, 170], 160); disc(b, cx + 11, cy + 2, 2, [255, 150, 170], 160);
}

// ---- palettes ----
const PALS = {
  cream: { bg: "#FBF1DC", shell: "#F1D29A", rim: "#CF9E5E", hi: "#FCEFCB", accent: "#E8845B", btn: "#EBA06A", lcd: "#D6E2A6", lcdLine: "#C3D08A", lcdInk: "#5A6B36", shellInk: "#9A7340", pet: "#FF9EC4" },
  mint: { bg: "#EAF6F0", shell: "#A9DAC9", rim: "#6FAFA0", hi: "#CFEFE2", accent: "#F0875E", btn: "#7FC7B6", lcd: "#CBDBA0", lcdLine: "#B6C988", lcdInk: "#3F6150", shellInk: "#3C6256", pet: "#F2B25A" },
  dusk: { bg: "#F0ECF7", shell: "#C7B4E2", rim: "#9A80C4", hi: "#E0D5F0", accent: "#F2A65A", btn: "#B49AD8", lcd: "#D2D6B8", lcdInk: "#5A5740", lcdLine: "#BFC4A0", shellInk: "#6E5A92", pet: "#7FD4F2" },
};

function render(shape, palName) {
  const P = PALS[palName]; const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, hx(v)]));
  const b = canvas(); rect(b, 0, 0, W, H, C.bg);

  // device shell
  if (shape === "egg") { ell(b, 150, 240, 142, 222, C.rim); ell(b, 150, 238, 136, 214, C.shell); ell(b, 150, 150, 96, 70, C.hi, 60); }
  else { rrect(b, 16, 26, 268, 420, 46, C.rim); rrect(b, 20, 28, 260, 412, 42, C.shell); rrect(b, 36, 50, 228, 70, 30, C.hi, 55); }

  // brand
  const brand = "CLOUDPET"; text(b, 150 - textW(brand, 3) / 2, 58, brand, 3, C.accent);
  disc(b, 150 - textW(brand, 3) / 2 - 14, 64, 4, C.accent); disc(b, 150 + textW(brand, 3) / 2 + 10, 64, 4, C.accent);

  // top icon row
  const topIcons = [["food", I.food], ["bath", I.bath], ["play", I.play], ["med", I.med], ["status", I.status]];
  const tx0 = 60, tgap = 45, ty = 100;
  topIcons.forEach(([, fn], i) => fn(b, tx0 + i * tgap, ty, C.shellInk));
  // cursor on first icon (food)
  rstroke(b, tx0 - 13, ty - 12, 26, 26, 6, 2, C.accent);

  // LCD bezel + screen
  const lx = 44, ly = 128, lw = 212, lh = 196;
  rrect(b, lx - 6, ly - 6, lw + 12, lh + 12, 18, dark(C.rim, 0.8)); // bezel
  rrect(b, lx, ly, lw, lh, 12, C.lcd);
  // scanlines + pixel grid (retro LCD)
  for (let y = ly + 2; y < ly + lh - 2; y += 3) rect(b, lx + 4, y, lw - 8, 1, C.lcdLine, 90);
  for (let x = lx + 6; x < lx + lw - 4; x += 6) rect(b, x, ly + 4, 1, lh - 8, C.lcdLine, 50);

  // pet on screen + labels
  petOnScreen(b, 150, ly + 78, C.pet, C.lcdInk);
  const nm = "LV 4"; text(b, lx + 14, ly + lh - 44, nm, 3, C.lcdInk);
  // evolution bar
  const bx = lx + 14, bw = lw - 28, byy = ly + lh - 22;
  rrect(b, bx, byy, bw, 8, 4, dark(C.lcd, 0.82));
  rrect(b, bx, byy, Math.round(bw * 0.78), 8, 4, C.accent);
  text(b, lx + lw - 14 - textW("78", 2), ly + lh - 42, "78", 2, C.lcdInk);

  // bottom icon row
  const botIcons = [["heart", I.heart], ["moon", I.moon], ["egg", I.egg], ["gear", I.gear]];
  const bxn = 78, bgap = 48, byn = 348;
  botIcons.forEach(([, fn], i) => fn(b, bxn + i * bgap, byn, C.shellInk));

  // 3 buttons
  const labels = ["A", "B", "C"]; const cxs = [92, 150, 208], byb = 410;
  labels.forEach((L, i) => { disc(b, cxs[i], byb, 22, dark(C.rim, 0.9)); disc(b, cxs[i], byb, 19, C.btn); disc(b, cxs[i] - 5, byb - 6, 5, C.hi, 120); text(b, cxs[i] - textW(L, 3) / 2, byb - 7, L, 3, [255, 255, 255]); });

  return encode(b);
}

// ---- PNG ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++)c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++)c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length, 0); const bd = Buffer.concat([Buffer.from(t, "ascii"), d]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(bd), 0); return Buffer.concat([l, bd, cr]); };
function encode(rgba) { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6; const raw = Buffer.alloc((W * 4 + 1) * H); for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(rgba.buffer).copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4); } return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]); }

let n = 0;
for (const shape of ["egg", "square"]) for (const pal of ["cream", "mint", "dusk"]) { writeFileSync(join(OUT, `${shape}_${pal}.png`), render(shape, pal)); n++; }
console.log(`rendered ${n} device mockups → ${OUT}`);
