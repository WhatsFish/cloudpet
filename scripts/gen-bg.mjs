#!/usr/bin/env node
// Four simple procedural pixel BACKGROUNDS for the pet stage (room/sky/meadow/night).
// Soft + low-contrast so the pet pops and the LCD scanlines read over them. The client
// picks one from timeBand/asleep/moodBand. Rendered 128x64, CSS-scaled pixelated.
// Usage: node scripts/gen-bg.mjs

import { encode } from "./gen-art.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "miniprogram/assets/bg");
mkdirSync(OUT, { recursive: true });
const W = 128, H = 64;

const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function buf() { const b = new Uint8ClampedArray(W * H * 4); return b; }
function px(b, x, y, c, a = 255) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; b[i] = c[0]; b[i + 1] = c[1]; b[i + 2] = c[2]; b[i + 3] = a; }
function rect(b, x0, y0, x1, y1, c) { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px(b, x, y, c); }
function vgrad(b, y0, y1, top, bot) { for (let y = y0; y < y1; y++) { const t = (y - y0) / Math.max(1, y1 - y0 - 1); const c = mix(top, bot, t); for (let x = 0; x < W; x++) px(b, x, y, c); } }
function disc(b, cx, cy, r, c, a = 255) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) px(b, cx + dx, cy + dy, c, a); }
function hill(b, cy, amp, c) { for (let x = 0; x < W; x++) { const y = Math.round(cy + amp * Math.sin(x / 22)); rect(b, x, y, x + 1, H, c); } }

function room() {
  const b = buf();
  vgrad(b, 0, 44, hx("#F3E2C4"), hx("#EAD2A8")); // warm wall
  rect(b, 0, 44, W, H, hx("#C99B63")); rect(b, 0, 44, W, 46, hx("#B98A52")); // floor + skirting
  // window
  vgrad2(b, 15, 9, 49, 35, hx("#BFE8F2"), hx("#8FC6DC"));
  rectOutline(b, 14, 8, 50, 36, hx("#A9854E")); // frame
  for (let y = 9; y < 35; y++) px(b, 31, y, hx("#A9854E")); for (let x = 15; x < 49; x++) px(b, x, 21, hx("#A9854E"));
  // a little plant on the floor right
  rect(b, 98, 38, 104, 46, hx("#C9743C")); disc(b, 101, 34, 5, hx("#6FA84E")); disc(b, 98, 33, 3, hx("#7FB85E")); disc(b, 105, 35, 3, hx("#7FB85E"));
  // rug
  for (let x = 30; x < 98; x++) { const t = (x - 30) / 68; px(b, x, 58, mix(hx("#E5897A"), hx("#E0B36A"), t)); px(b, x, 59, mix(hx("#D5796A"), hx("#D0A35A"), t)); }
  return b;
}
function vgrad2(b, x0, y0, x1, y1, top, bot) { for (let y = y0; y < y1; y++) { const t = (y - y0) / Math.max(1, y1 - y0 - 1); const c = mix(top, bot, t); for (let x = x0; x < x1; x++) px(b, x, y, c); } }

function sky() {
  const b = buf();
  vgrad(b, 0, H, hx("#FBD9B0"), hx("#BFE3F2")); // dawn peach → blue
  disc(b, 100, 16, 9, hx("#FFE9A8")); disc(b, 100, 16, 6, hx("#FFF4CF")); // soft sun
  // clouds
  for (const [cx, cy] of [[34, 24], [70, 14]]) { disc(b, cx, cy, 5, hx("#FFFFFF"), 230); disc(b, cx + 6, cy + 1, 4, hx("#FFFFFF"), 230); disc(b, cx - 5, cy + 1, 3, hx("#FFFFFF"), 230); }
  rect(b, 0, 58, W, H, hx("#9FCB72")); // a sliver of ground
  return b;
}

function meadow() {
  const b = buf();
  vgrad(b, 0, 40, hx("#BFE6F2"), hx("#E7F4D9"));
  disc(b, 22, 14, 7, hx("#FFF0B0")); // sun
  hill(b, 40, 4, hx("#9FCB6A")); hill(b, 48, 5, hx("#86B956"));
  rect(b, 0, 52, W, H, hx("#74AA48"));
  // flowers
  for (const [fx, fy, c] of [[40, 50, "#F4C6D8"], [64, 54, "#FFF0A0"], [92, 51, "#E6B0E0"]]) {
    px(b, fx, fy, hx(c)); px(b, fx - 1, fy, hx(c)); px(b, fx + 1, fy, hx(c)); px(b, fx, fy - 1, hx(c)); px(b, fx, fy + 1, hx(c)); px(b, fx, fy, hx("#FFF6C0"));
    px(b, fx, fy + 2, hx("#4E8A3E"));
  }
  return b;
}

function night() {
  const b = buf();
  vgrad(b, 0, 54, hx("#26284A"), hx("#3E4A78"));
  // stars (fixed)
  for (const [x, y] of [[12, 8], [30, 14], [48, 6], [70, 12], [88, 8], [104, 16], [20, 24], [60, 22], [114, 26], [40, 30]]) { px(b, x, y, hx("#FFF6D0")); if ((x + y) % 3 === 0) { px(b, x + 1, y, hx("#D8E0FF"), 160); px(b, x, y + 1, hx("#D8E0FF"), 160); } }
  // crescent moon
  disc(b, 98, 16, 8, hx("#FBEFC0")); disc(b, 102, 13, 7, hx("#2A2C4E"));
  rect(b, 0, 54, W, H, hx("#1F2240")); rect(b, 0, 54, W, 56, hx("#2A2E54"));
  return b;
}

// rect() with outline support tweak: accept (b,x0,y0,x1,y1,fill,outline,isOutline)
function rectOutline(b, x0, y0, x1, y1, col) {
  for (let x = x0; x < x1; x++) { px(b, x, y0, col); px(b, x, y1 - 1, col); }
  for (let y = y0; y < y1; y++) { px(b, x0, y, col); px(b, x1 - 1, y, col); }
}
// patch the room() frame call to use rectOutline (rect signature kept simple above)

const scenes = { room: room(), sky: sky(), meadow: meadow(), night: night() };
let n = 0;
for (const [name, b] of Object.entries(scenes)) { writeFileSync(join(OUT, `${name}.png`), encode(b, W, H)); n++; }
console.log(`rendered ${n} backgrounds → miniprogram/assets/bg`);
