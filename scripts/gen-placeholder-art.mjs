#!/usr/bin/env node
// Deterministic placeholder sprite generator (pure Node, no deps — built-in zlib).
// Emits 64x64 RGBA PNGs at the canonical paths
//   miniprogram/assets/pets/<creatureId>/{egg,baby_<mood>,child_<mood>}.png
// Each creature has its OWN silhouette (fox ears+tail, flame hair, water-drop
// pudding, leaf sprout, jellyfish dome+tentacles, …) so the 图鉴 reads as 10
// distinct critters, not one recolored blob. Still placeholders — real AI pixel
// art drops in at the same paths with zero code change (PLAN §9.2).

import zlib from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "miniprogram/assets/pets");
const W = 64, H = 64;
const MOODS = ["idle", "happy", "sad", "sleeping", "sulk", "hide"];
const INK = [44, 36, 52];

const CREATURES = {
  mochi_pudding: "#FF9EC4", echo_fox: "#5B4B8A", ember_imp: "#FF6B2C",
  sproutling: "#7FB069", stone_egg: "#9C8B7A", puff_seal: "#FFB6CE",
  wisp_moth: "#F2C94C", clay_golem: "#C97B5A", spark_sprite: "#56CCF2",
  dream_jelly: "#B39DDB",
};

// ---- color helpers ----
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const dark = (c, f = 0.62) => c.map((v) => Math.round(v * f));
const lite = (c, t = 0.4) => mix(c, [255, 255, 255], t);
function bodyTint(accent, mood) {
  if (mood === "sad" || mood === "sleeping") return mix(accent, [120, 120, 140], 0.2);
  if (mood === "happy") return mix(accent, [255, 255, 255], 0.1);
  return accent;
}

// ---- raster primitives ----
function canvas() { return new Uint8ClampedArray(W * H * 4); }
function px(buf, x, y, c, a = 255) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = a;
}
function ellipse(buf, cx, cy, rx, ry, c, a = 255) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++)
    if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) px(buf, cx + x, cy + y, c, a);
}
const disc = (buf, cx, cy, r, c, a = 255) => ellipse(buf, cx, cy, r, r, c, a);
function tri(buf, ax, ay, bx, by, cx, cy, c, a = 255) {
  const minx = Math.min(ax, bx, cx), maxx = Math.max(ax, bx, cx);
  const miny = Math.min(ay, by, cy), maxy = Math.max(ay, by, cy);
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
    const w0 = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const w1 = (cx - bx) * (y - by) - (cy - by) * (x - bx);
    const w2 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
    if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) px(buf, x, y, c, a);
  }
}
function stroke(buf, x0, y0, x1, y1, r, c) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) disc(buf, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, r, c);
}
function roundRect(buf, cx, cy, hw, hh, rad, c) {
  for (let y = -hh; y <= hh; y++) for (let x = -hw; x <= hw; x++) {
    const ox = Math.max(0, Math.abs(x) - (hw - rad)), oy = Math.max(0, Math.abs(y) - (hh - rad));
    if (ox * ox + oy * oy <= rad * rad) px(buf, cx + x, cy + y, c);
  }
}
function shadow(buf) { ellipse(buf, 32, 57, 15, 3, [0, 0, 0], 38); }

// outlined round/ellipse body
function obody(buf, cx, cy, rx, ry, c) { ellipse(buf, cx, cy, rx + 1, ry + 1, dark(c)); ellipse(buf, cx, cy, rx, ry, c); }

function face(buf, cx, cy, mood, spread) {
  const lx = cx - spread, rx = cx + spread;
  if (mood === "sleeping") {
    for (let x = -2; x <= 2; x++) { px(buf, lx + x, cy, INK); px(buf, rx + x, cy, INK); }
    px(buf, cx, cy + 5, INK); return;
  }
  if (mood === "happy") {
    for (const ex of [lx, rx]) { px(buf, ex, cy - 1, INK); px(buf, ex - 1, cy, INK); px(buf, ex + 1, cy, INK); }
    for (let x = -3; x <= 3; x++) px(buf, cx + x, cy + 5 + (Math.abs(x) === 3 ? -1 : 0), INK);
    // cheeks
    disc(buf, lx - 1, cy + 3, 1, [255, 150, 170], 150); disc(buf, rx + 1, cy + 3, 1, [255, 150, 170], 150);
    return;
  }
  for (const ex of [lx, rx]) { disc(buf, ex, cy, 1, INK); px(buf, ex - 1, cy - 1, lite(INK, 0.6)); }
  if (mood === "sad") { for (let x = -2; x <= 2; x++) px(buf, cx + x, cy + 6 + (Math.abs(x) === 2 ? -1 : 0), INK); px(buf, rx + 1, cy + 3, [110, 180, 230]); }
  else if (mood === "sulk") { px(buf, lx - 1, cy - 2, INK); px(buf, lx, cy - 2, INK); px(buf, rx, cy - 2, INK); px(buf, rx + 1, cy - 2, INK); for (let x = -2; x <= 2; x++) px(buf, cx + x, cy + 5, INK); }
  else { px(buf, cx - 1, cy + 5, INK); px(buf, cx, cy + 5, INK); px(buf, cx + 1, cy + 5, INK); }
}

// peeking-from-a-box state, shared
function drawHide(buf, accent) {
  disc(buf, 32, 40, 11, accent); face(buf, 32, 38, "idle", 5);
  for (let y = 45; y < 58; y++) for (let x = 13; x < 51; x++) px(buf, x, y, [150, 140, 135]);
  for (let x = 13; x < 51; x++) px(buf, x, 45, dark([150, 140, 135], 0.7));
}

// ---- per-creature recipes: draw(buf, accent, mood, big) ----
const DRAW = {
  mochi_pudding(buf, accent, mood, big) {
    const c = bodyTint(accent, mood), s = big ? 18 : 14, cy = big ? 38 : 40;
    // teardrop: disc + top point
    tri(buf, 32, cy - s - 6, 32 - 6, cy - s + 3, 32 + 6, cy - s + 3, dark(c));
    tri(buf, 32, cy - s - 4, 32 - 5, cy - s + 3, 32 + 5, cy - s + 3, c);
    obody(buf, 32, cy, s, s + 2, c);
    disc(buf, 32 - s / 3, cy - s / 3, 3, lite(c, 0.5), 170); // highlight
    for (let i = 0; i < 4; i++) px(buf, 33 + i, cy - s - 5 - i, [230, 160, 90]); // 糖浆 curl
    if (mood !== "sleeping") { disc(buf, 32, cy + 4, 2, [255, 130, 175]); px(buf, 32, cy + 2, [255, 130, 175]); } // heart
    face(buf, 32, cy - 1, mood, big ? 7 : 6);
  },
  echo_fox(buf, accent, mood, big) {
    const c = bodyTint(accent, mood), s = big ? 16 : 13, cy = big ? 37 : 40;
    // tail with orb
    stroke(buf, 32 + s, cy + 2, 32 + s + 9, cy + 8, 3, dark(c)); stroke(buf, 32 + s, cy + 2, 32 + s + 9, cy + 8, 2, c);
    disc(buf, 32 + s + 9, cy + 8, 3, [191, 233, 242]); disc(buf, 32 + s + 9, cy + 8, 1, [255, 255, 255]);
    // ears
    tri(buf, 32 - s + 1, cy - s + 2, 32 - s - 3, cy - s - 8, 32 - 3, cy - s - 1, dark(c));
    tri(buf, 32 - s + 2, cy - s + 2, 32 - s - 2, cy - s - 6, 32 - 4, cy - s, c);
    tri(buf, 32 + s - 1, cy - s + 2, 32 + s + 3, cy - s - 8, 32 + 3, cy - s - 1, dark(c));
    tri(buf, 32 + s - 2, cy - s + 2, 32 + s + 2, cy - s - 6, 32 + 4, cy - s, c);
    obody(buf, 32, cy, s, s, c);
    disc(buf, 32, cy + 3, s - 5, lite(c, 0.35)); // lighter muzzle
    face(buf, 32, cy, mood, big ? 6 : 5);
    px(buf, 38 + (big ? 1 : 0), cy + 2, [40, 32, 48]); // tiny nose hint via mouth area
  },
  ember_imp(buf, accent, mood, big) {
    const c = bodyTint(accent, mood), s = big ? 15 : 12, cy = big ? 38 : 41;
    // flame hair
    const ft = mood === "sulk" ? [225, 29, 29] : [255, 180, 60];
    tri(buf, 32 - 7, cy - s + 2, 32 - 9, cy - s - 10, 32 - 1, cy - s, [225, 60, 20]);
    tri(buf, 32, cy - s + 2, 32 - 2, cy - s - 14, 32 + 4, cy - s, ft);
    tri(buf, 32 + 7, cy - s + 2, 32 + 9, cy - s - 10, 32 + 1, cy - s, [225, 60, 20]);
    tri(buf, 32 + 1, cy - s - 1, 32, cy - s - 9, 32 + 3, cy - s, [255, 230, 120]);
    obody(buf, 32, cy, s, s, mix(c, [90, 46, 26], 0.25)); // charcoal-ish body
    disc(buf, 32 + s - 2, cy, 4, dark(c, 0.8)); disc(buf, 32 - s + 2, cy, 4, dark(c, 0.8)); // cheek nubs (arms)
    disc(buf, 32 - 6, cy + s - 1, 3, dark(c, 0.7)); disc(buf, 32 + 6, cy + s - 1, 3, dark(c, 0.7)); // feet
    face(buf, 32, cy, mood, big ? 6 : 5);
  },
  sproutling(buf, accent, mood, big) {
    const c = bodyTint(accent, mood), s = big ? 14 : 11, cy = big ? 40 : 42;
    stroke(buf, 32, cy - s, 32, cy - s - 8, 1, [90, 150, 70]); // stem
    tri(buf, 32, cy - s - 4, 32 - 9, cy - s - 9, 32 - 1, cy - s - 14, [120, 200, 110]); // left leaf
    tri(buf, 32, cy - s - 4, 32 + 9, cy - s - 9, 32 + 1, cy - s - 14, [140, 215, 120]); // right leaf
    obody(buf, 32, cy, s, s + 2, mix(c, [245, 240, 210], 0.35)); // bean body (pale)
    face(buf, 32, cy, mood, big ? 6 : 5);
  },
  stone_egg(buf, accent, mood, big) {
    const c = bodyTint(accent, mood), s = big ? 17 : 14, cy = big ? 39 : 41;
    obody(buf, 32, cy, s, s - 2, c);
    // moss cap
    for (const [dx, dy, r] of [[-7, -s + 1, 3], [0, -s - 1, 4], [7, -s + 1, 3]]) disc(buf, 32 + dx, cy + dy, r, [110, 160, 90]);
    disc(buf, 32, cy - s, 2, [140, 190, 110]);
    face(buf, 32, cy, mood === "happy" ? "idle" : mood, big ? 6 : 5); // stoic — rarely beams
  },
  puff_seal(buf, accent, mood, big) {
    const c = bodyTint(accent, mood), s = big ? 17 : 14, cy = big ? 39 : 41;
    ellipse(buf, 32 - s + 1, cy + 4, 5, 3, dark(c)); ellipse(buf, 32 + s - 1, cy + 4, 5, 3, dark(c)); // flippers shadow
    ellipse(buf, 32 - s + 1, cy + 3, 4, 2, lite(c, 0.2)); ellipse(buf, 32 + s - 1, cy + 3, 4, 2, lite(c, 0.2));
    obody(buf, 32, cy, s, s - 1, c);
    disc(buf, 32, cy + 4, 4, lite(c, 0.45)); // creamy snout
    face(buf, 32, cy - 1, mood, big ? 7 : 6);
  },
  wisp_moth(buf, accent, mood, big) {
    const c = bodyTint(accent, mood), s = big ? 9 : 7, cy = big ? 36 : 39;
    ellipse(buf, 32 - s - 5, cy, 7, 9, mix(c, [255, 245, 200], 0.45)); // wings
    ellipse(buf, 32 + s + 5, cy, 7, 9, mix(c, [255, 245, 200], 0.45));
    ellipse(buf, 32 - s - 5, cy, 7, 9, dark(c, 0.85), 60); ellipse(buf, 32 + s + 5, cy, 7, 9, dark(c, 0.85), 60);
    obody(buf, 32, cy, s, s + 3, mix(c, [120, 100, 60], 0.2)); // furry body
    stroke(buf, 32 - 2, cy - s - 2, 32 - 6, cy - s - 9, 1, INK); disc(buf, 32 - 6, cy - s - 9, 1, [255, 220, 120]); // antennae
    stroke(buf, 32 + 2, cy - s - 2, 32 + 6, cy - s - 9, 1, INK); disc(buf, 32 + 6, cy - s - 9, 1, [255, 220, 120]);
    disc(buf, 32, cy + s + 6, 3, [255, 210, 90]); disc(buf, 32, cy + s + 6, 1, [255, 255, 200]); // lantern
    face(buf, 32, cy, mood, big ? 4 : 4);
  },
  clay_golem(buf, accent, mood, big) {
    const c = bodyTint(accent, mood), hw = big ? 15 : 12, hh = big ? 16 : 13, cy = big ? 37 : 40;
    disc(buf, 32 - hw - 1, cy + 2, 4, dark(c)); disc(buf, 32 + hw + 1, cy + 2, 4, dark(c)); // stubby arms
    disc(buf, 32 - hw - 1, cy + 2, 3, c); disc(buf, 32 + hw + 1, cy + 2, 3, c);
    roundRect(buf, 32, cy, hw + 1, hh + 1, 6, dark(c)); roundRect(buf, 32, cy, hw, hh, 6, c);
    disc(buf, 32, cy + 6, 3, [255, 150, 60]); disc(buf, 32, cy + 6, 1, [255, 230, 150]); // kiln fire chest
    face(buf, 32, cy - 3, mood, big ? 6 : 5);
  },
  spark_sprite(buf, accent, mood, big) {
    const c = bodyTint(accent, mood), s = big ? 13 : 11, cy = big ? 40 : 42;
    // lightning bolt on top
    const Z = [[32 - 1, cy - s - 1], [32 + 4, cy - s - 6], [32 + 1, cy - s - 6], [32 + 5, cy - s - 12]];
    for (let i = 0; i < Z.length - 1; i++) stroke(buf, Z[i][0], Z[i][1], Z[i + 1][0], Z[i + 1][1], 1, [255, 230, 90]);
    disc(buf, 32 - s - 1, cy - 3, 1, [255, 235, 120]); disc(buf, 32 + s + 1, cy + 2, 1, [255, 235, 120]); // sparks
    obody(buf, 32, cy, s, s, c);
    disc(buf, 32 - s / 3, cy - s / 3, 3, lite(c, 0.5), 160);
    face(buf, 32, cy, mood, big ? 6 : 5);
  },
  dream_jelly(buf, accent, mood, big) {
    const c = bodyTint(accent, mood), s = big ? 17 : 14, cy = big ? 34 : 37;
    // tentacles
    for (let i = -2; i <= 2; i++) {
      const x = 32 + i * (s / 2.6);
      stroke(buf, x, cy + s - 4, x + (i % 2 ? 2 : -2), cy + s + 6, 1, mix(c, [255, 255, 255], 0.2));
    }
    // dome (top half)
    for (let y = -s; y <= 4; y++) for (let x = -s; x <= s; x++)
      if ((x * x) / (s * s) + (y * y) / (s * s) <= 1) px(buf, 32 + x, cy + y, c);
    for (let x = -s; x <= s; x++) if ((x * x) / (s * s) <= 1) px(buf, 32 + x, cy - Math.round(Math.sqrt(Math.max(0, 1 - x * x / (s * s))) * s), dark(c));
    disc(buf, 32 - 4, cy - 4, 2, [255, 255, 255], 150); disc(buf, 32 + 5, cy + 1, 1, lite(c, 0.6)); // nebula specks
    face(buf, 32, cy, mood, big ? 6 : 5);
  },
};

function drawCreature(id, accent, mood, big) {
  const buf = canvas();
  shadow(buf);
  if (mood === "hide") { drawHide(buf, accent); return encodePNG(buf); }
  DRAW[id](buf, accent, mood, big);
  return encodePNG(buf);
}

function drawEgg(accent) {
  const buf = canvas();
  shadow(buf);
  const shell = mix(accent, [255, 255, 255], 0.55);
  ellipse(buf, 32, 34, 17, 21, dark(shell, 0.8));
  ellipse(buf, 32, 34, 15, 19, shell);
  for (const [x, y] of [[26, 28], [38, 40], [30, 44], [40, 26]]) disc(buf, x, y, 2, accent, 200);
  return encodePNG(buf);
}

// ---- PNG encode (RGBA) ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const body = Buffer.concat([Buffer.from(type, "ascii"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0); return Buffer.concat([len, body, crc]); }
function encodePNG(rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(rgba.buffer).copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4); }
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

let count = 0;
for (const [id, accentHex] of Object.entries(CREATURES)) {
  const accent = hex(accentHex);
  const dir = join(OUT, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "egg.png"), drawEgg(accent)); count++;
  for (const mood of MOODS) {
    writeFileSync(join(dir, `baby_${mood}.png`), drawCreature(id, accent, mood, false)); count++;
    writeFileSync(join(dir, `child_${mood}.png`), drawCreature(id, accent, mood, true)); count++;
  }
}
mkdirSync(join(OUT, "_fallback"), { recursive: true });
writeFileSync(join(OUT, "_fallback", "blob.png"), drawCreature("mochi_pudding", hex("#C9C9D6"), "idle", false));
count++;
console.log(`generated ${count} distinct placeholder sprites under ${OUT}`);
