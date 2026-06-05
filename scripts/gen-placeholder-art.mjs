#!/usr/bin/env node
// Deterministic placeholder sprite generator. Emits 64x64 RGBA PNGs (pure Node,
// no deps — built-in zlib) at the canonical paths
//   miniprogram/assets/pets/<creatureId>/{egg,baby_<mood>,child_<mood>}.png
// so the whole game loop renders today; real AI pixel art drops in at the same
// paths with zero code change (PLAN §9.2). Cute-ish blob + mood face; accent
// color identifies the creature.

import zlib from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "miniprogram/assets/pets");

const W = 64, H = 64;
const MOODS = ["idle", "happy", "sad", "sleeping", "sulk", "hide"];
const CREATURES = {
  mochi_pudding: "#FF9EC4", echo_fox: "#5B4B8A", ember_imp: "#FF6B2C",
  sproutling: "#7FB069", stone_egg: "#9C8B7A", puff_seal: "#FFB6CE",
  wisp_moth: "#F2C94C", clay_golem: "#C97B5A", spark_sprite: "#56CCF2",
  dream_jelly: "#B39DDB",
};

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const dark = (c, f = 0.6) => c.map((v) => Math.round(v * f));
const INK = [40, 32, 48];

function canvas() { return new Uint8ClampedArray(W * H * 4); }
function px(buf, x, y, c, a = 255) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = a;
}
function ellipse(buf, cx, cy, rx, ry, c, a = 255) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) px(buf, cx + x, cy + y, c, a);
  }
}
function disc(buf, cx, cy, r, c, a = 255) { ellipse(buf, cx, cy, r, r, c, a); }

// --- PNG encode (RGBA, color type 6) ---
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, "ascii");
  const body = Buffer.concat([tb, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    Buffer.from(rgba.buffer).copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

function shadow(buf) { ellipse(buf, 32, 56, 16, 4, [0, 0, 0], 40); }

function face(buf, cx, cy, mood, spread = 6) {
  const lx = cx - spread, rx = cx + spread;
  if (mood === "sleeping") {
    for (let x = -2; x <= 2; x++) { px(buf, lx + x, cy, INK); px(buf, rx + x, cy, INK); }
    px(buf, cx, cy + 5, INK); // tiny mouth
    return;
  }
  if (mood === "happy") {
    for (const ex of [lx, rx]) { px(buf, ex, cy - 1, INK); px(buf, ex - 1, cy, INK); px(buf, ex + 1, cy, INK); }
    for (let x = -3; x <= 3; x++) px(buf, cx + x, cy + 5 + (Math.abs(x) === 3 ? -1 : 0), INK);
    return;
  }
  // dot eyes
  for (const ex of [lx, rx]) disc(buf, ex, cy, 1, INK);
  if (mood === "sad") {
    for (let x = -2; x <= 2; x++) px(buf, cx + x, cy + 6 + (Math.abs(x) === 2 ? -1 : 0), INK); // frown
    px(buf, rx + 1, cy + 3, [110, 180, 230]); // tear
  } else if (mood === "sulk") {
    px(buf, lx - 1, cy - 2, INK); px(buf, lx, cy - 2, INK); // angry brows
    px(buf, rx, cy - 2, INK); px(buf, rx + 1, cy - 2, INK);
    for (let x = -2; x <= 2; x++) px(buf, cx + x, cy + 5, INK); // flat mouth
  } else { // idle
    px(buf, cx - 1, cy + 5, INK); px(buf, cx, cy + 5, INK); px(buf, cx + 1, cy + 5, INK);
  }
}

function drawEgg(accent) {
  const buf = canvas();
  shadow(buf);
  const shell = mix(accent, [255, 255, 255], 0.55);
  ellipse(buf, 32, 34, 17, 21, dark(shell, 0.8)); // outline
  ellipse(buf, 32, 34, 15, 19, shell);
  // accent speckles
  for (const [x, y] of [[26, 28], [38, 40], [30, 44], [40, 26]]) disc(buf, x, y, 2, accent, 200);
  return encodePNG(buf);
}

function drawBlob(accent, mood, big) {
  const buf = canvas();
  shadow(buf);
  if (mood === "hide") {
    // peeking from a box
    disc(buf, 32, 40, big ? 12 : 10, accent);
    face(buf, 32, 38, "idle", 5);
    for (let y = 44; y < 58; y++) for (let x = 14; x < 50; x++) px(buf, x, y, [150, 140, 135]);
    for (let x = 14; x < 50; x++) px(buf, x, 44, dark([150, 140, 135], 0.7));
    return encodePNG(buf);
  }
  const cy = big ? 36 : 39;
  const r = big ? 18 : 14;
  if (big) { disc(buf, 24, 54, 4, dark(accent, 0.85)); disc(buf, 40, 54, 4, dark(accent, 0.85)); } // feet
  disc(buf, 32, cy, r + 1, dark(accent, 0.78)); // outline
  disc(buf, 32, cy, r, accent);
  disc(buf, 32 - r / 3, cy - r / 3, Math.round(r / 3), mix(accent, [255, 255, 255], 0.4), 180); // highlight
  if (mood === "happy") disc(buf, 32, cy, r, mix(accent, [255, 255, 255], 0.12)); // brighten
  if (mood === "sad" || mood === "sleeping") disc(buf, 32, cy, r, mix(accent, [120, 120, 140], 0.18));
  face(buf, 32, cy - 1, mood, big ? 7 : 6);
  return encodePNG(buf);
}

let count = 0;
for (const [id, accentHex] of Object.entries(CREATURES)) {
  const accent = hex(accentHex);
  const dir = join(OUT, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "egg.png"), drawEgg(accent)); count++;
  for (const mood of MOODS) {
    writeFileSync(join(dir, `baby_${mood}.png`), drawBlob(accent, mood, false)); count++;
    writeFileSync(join(dir, `child_${mood}.png`), drawBlob(accent, mood, true)); count++;
  }
}
// generic fallback
mkdirSync(join(OUT, "_fallback"), { recursive: true });
writeFileSync(join(OUT, "_fallback", "blob.png"), drawBlob(hex("#C9C9D6"), "idle", false));
count++;

console.log(`generated ${count} placeholder sprites under ${OUT}`);
