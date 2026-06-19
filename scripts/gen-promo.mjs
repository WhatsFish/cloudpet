// Generate 4 小红书 promo cover images (3:4, 600×900) — one per copy angle — from the real
// pixel pets. No text in the image (the post caption carries words); cute pixel scenes only.
// Run: node scripts/gen-promo.mjs → docs/promo/{bestiary,cozy,handheld,attitude}.png
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderBuf, encode, W, H } from "./gen-art.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MW = 600, MH = 900;

function newCanvas() { return new Uint8ClampedArray(MW * MH * 4); }
function mk(buf) {
  const set = (x, y, r, g, b, a = 255) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= MW || y >= MH) return;
    const i = (y * MW + x) * 4, af = a / 255;
    buf[i] = Math.round(r * af + buf[i] * (1 - af));
    buf[i + 1] = Math.round(g * af + buf[i + 1] * (1 - af));
    buf[i + 2] = Math.round(b * af + buf[i + 2] * (1 - af));
    buf[i + 3] = 255;
  };
  const grad = (top, bot) => { for (let y = 0; y < MH; y++) { const t = y / MH; for (let x = 0; x < MW; x++) { const i = (y * MW + x) * 4; buf[i] = top[0] * (1 - t) + bot[0] * t; buf[i + 1] = top[1] * (1 - t) + bot[1] * t; buf[i + 2] = top[2] * (1 - t) + bot[2] * t; buf[i + 3] = 255; } } };
  const disc = (cx, cy, r, c, a = 255) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) set(cx + x, cy + y, c[0], c[1], c[2], a); };
  const ring = (cx, cy, r, c) => { for (let d = 0; d < 360; d += 3) { set(cx + r * Math.cos(d / 180 * Math.PI), cy + r * Math.sin(d / 180 * Math.PI), c[0], c[1], c[2]); } };
  const rrect = (x0, y0, x1, y1, rad, c, a = 255) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const dx = Math.max(x0 + rad - x, 0, x - (x1 - rad)), dy = Math.max(y0 + rad - y, 0, y - (y1 - rad)); if (dx * dx + dy * dy <= rad * rad) set(x, y, c[0], c[1], c[2], a); } };
  const heart = (cx, cy, s, c, a = 255) => { const P = ["01010", "11111", "11111", "01110", "00100"]; for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (P[y][x] === "1") for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) set(cx + x * s + i, cy + y * s + j, c[0], c[1], c[2], a); };
  const star = (cx, cy, s, c) => { const P = ["00100", "00100", "11111", "01110", "01010"]; for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (P[y][x] === "1") for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) set(cx + x * s + i, cy + y * s + j, c[0], c[1], c[2]); };
  // blit a 64×64 sprite, scaled; crop its built-in contact shadow (y>52)
  const blit = (sp, ox, oy, sc) => { for (let y = 0; y < H; y++) { if (y > 52) continue; for (let x = 0; x < W; x++) { const a = sp[(y * W + x) * 4 + 3]; if (!a) continue; const r = sp[(y * W + x) * 4], g = sp[(y * W + x) * 4 + 1], b = sp[(y * W + x) * 4 + 2]; for (let sy = 0; sy < sc; sy++) for (let sx = 0; sx < sc; sx++) set(ox + x * sc + sx, oy + y * sc + sy, r, g, b, a); } } };
  const shadow = (cx, cy, rx, ry) => { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) set(cx + x, cy + y, 214, 176, 142, 70); };
  return { set, grad, disc, ring, rrect, heart, star, blit, shadow };
}

const CREAM = [255, 248, 234], PEACH = [255, 226, 200], MINT = [214, 240, 226];
const PINK = [255, 138, 160], YEL = [255, 209, 102], ORG = [245, 160, 90], CORAL = [232, 132, 91];
const ALL = [["puff", "child"], ["seal", "child"], ["claude", "child"], ["blocky", "child"], ["bear", "child"], ["penguin", "child"]];

// ── 1) bestiary: 6 pets, "which one is your 本命" ──────────────────────────────
function bestiary() {
  const buf = newCanvas(); const g = mk(buf);
  g.grad(CREAM, PEACH);
  // sparkle field
  g.star(70, 120, 5, YEL); g.heart(120, 200, 5, PINK); g.star(500, 150, 5, YEL);
  g.heart(470, 240, 4, ORG); g.star(300, 100, 4, YEL); g.heart(250, 160, 3, PINK);
  // two rows of 3, lower half
  const SC = 4;
  const rows = [[ALL[0], ALL[1], ALL[2]], [ALL[3], ALL[4], ALL[5]]];
  rows.forEach((row, r) => {
    const gy = 470 + r * 200;
    row.forEach(([line, stage], c) => {
      const cx = 150 + c * 150;
      g.shadow(cx, gy + 14, 52, 12);
      g.blit(renderBuf(line, "true", stage, "happy"), cx - 32 * SC, gy - 64 * SC + 24, SC);
    });
  });
  return encode(buf, MW, MH);
}

// ── 2) cozy: one big pet, ring of hearts ─────────────────────────────────────
function cozy() {
  const buf = newCanvas(); const g = mk(buf);
  g.grad([255, 244, 236], [255, 220, 224]);
  g.disc(300, 430, 230, [255, 240, 236], 120); // soft glow
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; g.heart(300 + 250 * Math.cos(a) - 12, 430 + 250 * Math.sin(a) - 12, 5, k % 2 ? PINK : ORG); }
  const SC = 8;
  g.shadow(300, 600, 110, 22);
  g.blit(renderBuf("puff", "true", "child", "happy"), 300 - 32 * SC, 600 - 64 * SC + 40, SC);
  g.heart(180, 360, 6, PINK); g.heart(400, 320, 5, ORG);
  return encode(buf, MW, MH);
}

// ── 3) handheld: retro device, one pet on the screen ─────────────────────────
function handheld() {
  const buf = newCanvas(); const g = mk(buf);
  g.grad([232, 244, 255], [210, 226, 245]);
  g.star(80, 110, 5, YEL); g.heart(500, 140, 5, PINK); g.star(470, 250, 4, YEL);
  // device body
  g.rrect(120, 230, 480, 740, 60, [250, 244, 226]);
  g.rrect(120, 230, 480, 740, 60, [225, 214, 190], 60); // subtle edge tint via overlay
  g.rrect(120, 230, 480, 740, 60, [250, 244, 226]);
  // screen
  g.rrect(165, 280, 435, 560, 26, [196, 224, 206]);
  g.rrect(180, 295, 420, 545, 18, [214, 240, 226]);
  const SC = 5;
  g.shadow(300, 520, 64, 12);
  g.blit(renderBuf("claude", "true", "child", "happy"), 300 - 32 * SC, 520 - 64 * SC + 18, SC);
  // d-pad + buttons
  g.rrect(180, 620, 240, 640, 6, [150, 140, 120]); g.rrect(200, 600, 220, 660, 6, [150, 140, 120]);
  g.disc(400, 630, 22, [232, 132, 91]); g.disc(360, 665, 18, [120, 170, 140]);
  g.disc(300, 700, 10, [180, 168, 148]); g.disc(330, 700, 10, [180, 168, 148]);
  return encode(buf, MW, MH);
}

// ── 4) attitude: a sulky pet + sweat/anger marks ─────────────────────────────
function attitude() {
  const buf = newCanvas(); const g = mk(buf);
  g.grad(CREAM, [255, 228, 214]);
  g.star(90, 130, 4, YEL); g.star(480, 180, 4, YEL);
  const SC = 8;
  g.shadow(300, 600, 110, 22);
  g.blit(renderBuf("bear", "true", "child", "sulk"), 300 - 32 * SC, 600 - 64 * SC + 40, SC);
  // anger vein (4 little marks) top-right of head
  const av = (cx, cy) => { [[0, 0], [6, 0], [0, 6], [-5, 5], [5, 5]].forEach(([dx, dy]) => g.disc(cx + dx, cy + dy, 3, [231, 90, 90])); };
  av(430, 230);
  // sweat drop
  g.disc(200, 250, 9, [120, 190, 230]); g.set(200, 238, 120, 190, 230); g.disc(200, 244, 5, [120, 190, 230]);
  return encode(buf, MW, MH);
}

const out = join(ROOT, "docs/promo");
mkdirSync(out, { recursive: true });
for (const [name, fn] of [["bestiary", bestiary], ["cozy", cozy], ["handheld", handheld], ["attitude", attitude]]) {
  const png = fn();
  writeFileSync(join(out, name + ".png"), png);
  console.log(`${name}.png  ${(png.length / 1024).toFixed(0)}KB`);
}
