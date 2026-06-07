#!/usr/bin/env node
// Procedural pixel BACKGROUNDS for the hero scene (meadow/sky/room/night), aligned to the
// pet06 design language: soft cream→blue sky, fluffy clouds, a grass band with flowers so
// the pet looks like it's standing on a little meadow. 144×96 (3:2) to match the scene card
// (no aspectFill cropping); ground line ~78% so the pet's feet rest on the grass.
// The client picks one from timeBand / asleep / moodBand. Usage: node scripts/gen-bg.mjs

import { encode } from "./gen-art.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "miniprogram/assets/bg");
mkdirSync(OUT, { recursive: true });
const W = 144, H = 96, GROUND = 74;

const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function buf() { return new Uint8ClampedArray(W * H * 4); }
function px(b, x, y, c, a = 255) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; b[i] = c[0]; b[i + 1] = c[1]; b[i + 2] = c[2]; b[i + 3] = a; }
function rect(b, x0, y0, x1, y1, c) { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px(b, x, y, c); }
function vgrad(b, y0, y1, top, bot, x0 = 0, x1 = W) { for (let y = y0; y < y1; y++) { const t = (y - y0) / Math.max(1, y1 - y0 - 1); const c = mix(top, bot, t); for (let x = x0; x < x1; x++) px(b, x, y, c); } }
function disc(b, cx, cy, r, c, a = 255) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) px(b, cx + dx, cy + dy, c, a); }
function rectO(b, x0, y0, x1, y1, c) { for (let x = x0; x < x1; x++) { px(b, x, y0, c); px(b, x, y1 - 1, c); } for (let y = y0; y < y1; y++) { px(b, x0, y, c); px(b, x1 - 1, y, c); } }
function cloud(b, cx, cy, s, c = hx("#FFFFFF"), a = 235) { disc(b, cx, cy, s, c, a); disc(b, cx + s + 1, cy + 1, s - 1, c, a); disc(b, cx - s, cy + 1, s - 2, c, a); disc(b, cx + 2, cy - 1, s - 1, c, a); }
function flower(b, fx, fy, c) { const col = hx(c); px(b, fx, fy, col); px(b, fx - 1, fy, col); px(b, fx + 1, fy, col); px(b, fx, fy - 1, col); px(b, fx, fy + 1, col); px(b, fx, fy, hx("#FFF6C0")); px(b, fx, fy + 2, hx("#4E8A3E")); }
function grass(b, top, c, edge) {
  rect(b, 0, top, W, H, c);
  for (let x = 0; x < W; x++) { const y = top + (Math.sin(x / 7) > 0.6 ? -1 : 0); px(b, x, y, edge); px(b, x, y + 1, edge); }
  for (let x = 3; x < W; x += 9) { px(b, x, top - 2, edge); px(b, x + 1, top - 1, edge); } // tiny blades
}

function meadow() {
  const b = buf();
  vgrad(b, 0, GROUND, hx("#FCEBD3"), hx("#CDE9F4")); // cream → soft blue
  disc(b, 122, 18, 10, hx("#FFE9A8"), 230); disc(b, 122, 18, 7, hx("#FFF4CF"), 240); // sun
  cloud(b, 34, 22, 5); cloud(b, 88, 14, 4); cloud(b, 60, 34, 3);
  grass(b, GROUND, hx("#A8D27E"), hx("#8FBE63"));
  for (const [fx, fy, c] of [[20, 86, "#F4B8C8"], [44, 90, "#FFF0A0"], [70, 85, "#E6B0E0"], [100, 89, "#F4B8C8"], [126, 86, "#FFF0A0"]]) flower(b, fx, fy, c);
  return b;
}

function sky() {
  const b = buf();
  vgrad(b, 0, GROUND, hx("#FBD9B0"), hx("#CFE6F2")); // peachy dawn → blue
  disc(b, 26, 24, 9, hx("#FFE9A8"), 235); disc(b, 26, 24, 6, hx("#FFF4CF"), 245);
  cloud(b, 70, 18, 5); cloud(b, 108, 30, 4); cloud(b, 44, 40, 3);
  grass(b, GROUND, hx("#9FCB6A"), hx("#86B956"));
  for (const [fx, fy, c] of [[30, 88, "#FFF0A0"], [64, 86, "#F4B8C8"], [104, 89, "#FFF0A0"]]) flower(b, fx, fy, c);
  return b;
}

function room() {
  const b = buf();
  vgrad(b, 0, GROUND, hx("#F6E6C8"), hx("#EEDCB6")); // warm wall
  // window with a slice of sky
  vgrad(b, 14, 50, hx("#CDEAF4"), hx("#A9D6E8"), 18, 64);
  cloud(b, 34, 22, 3, hx("#FFFFFF"), 220);
  rectO(b, 17, 13, 65, 51, hx("#C09A5E")); for (let y = 14; y < 50; y++) px(b, 41, y, hx("#C09A5E")); for (let x = 18; x < 64; x++) px(b, x, 31, hx("#C09A5E"));
  // shelf plant on the right
  rect(b, 110, 56, 120, GROUND, hx("#C9743C")); disc(b, 115, 50, 6, hx("#6FA84E")); disc(b, 110, 49, 4, hx("#7FB85E")); disc(b, 120, 51, 4, hx("#7FB85E"));
  // wood floor + soft rug
  rect(b, 0, GROUND, W, H, hx("#D8A86A")); rect(b, 0, GROUND, W, GROUND + 2, hx("#C2925A"));
  for (let x = 28; x < 116; x++) { const t = (x - 28) / 88; px(b, x, 90, mix(hx("#E5897A"), hx("#E0B36A"), t)); px(b, x, 91, mix(hx("#D5796A"), hx("#D0A35A"), t)); }
  return b;
}

function night() {
  const b = buf();
  vgrad(b, 0, GROUND, hx("#2A2C50"), hx("#46527E")); // deep night
  for (const [x, y] of [[14, 10], [34, 18], [54, 8], [78, 14], [98, 9], [118, 20], [24, 30], [66, 26], [128, 34], [44, 38], [108, 44]]) { px(b, x, y, hx("#FFF6D0")); if ((x + y) % 3 === 0) { px(b, x + 1, y, hx("#D8E0FF"), 160); px(b, x, y + 1, hx("#D8E0FF"), 160); } }
  disc(b, 116, 20, 9, hx("#FBEFC0"), 245); disc(b, 121, 16, 8, hx("#33365C")); // crescent moon
  grass(b, GROUND, hx("#3A4A4E"), hx("#46585C"));
  return b;
}

const scenes = { meadow: meadow(), sky: sky(), room: room(), night: night() };
let n = 0;
for (const [name, b] of Object.entries(scenes)) { writeFileSync(join(OUT, `${name}.png`), encode(b, W, H)); n++; }
console.log(`rendered ${n} backgrounds (${W}x${H}) → miniprogram/assets/bg`);
