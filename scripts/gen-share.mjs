// Generate the share-card cover: a cozy "group photo" of all 6 本命宠 (front row big,
// back row small for depth) on a warm gradient with scattered pixel hearts/stars. NO text
// (the share title carries the words). 5:4 (微信 share image ratio).
// Run: node scripts/gen-share.mjs → miniprogram/assets/share/cover.png (+ a docs/review copy)
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderBuf, encode, W, H } from "./gen-art.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MW = 600, MH = 480;
const buf = new Uint8ClampedArray(MW * MH * 4);

function set(x, y, r, g, b, a = 255) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= MW || y >= MH) return;
  const i = (y * MW + x) * 4, af = a / 255;
  buf[i] = Math.round(r * af + buf[i] * (1 - af));
  buf[i + 1] = Math.round(g * af + buf[i + 1] * (1 - af));
  buf[i + 2] = Math.round(b * af + buf[i + 2] * (1 - af));
  buf[i + 3] = 255;
}

// 1) warm vertical gradient background (cream → soft peach)
for (let y = 0; y < MH; y++) {
  const t = y / MH;
  const r = 255, g = Math.round(247 * (1 - t) + 226 * t), b = Math.round(232 * (1 - t) + 202 * t);
  for (let x = 0; x < MW; x++) { const i = (y * MW + x) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255; }
}

// 2) a faint warm floor band + a per-pet oval shadow helper (drawn with each pet)
for (let y = 388; y < MH; y++) for (let x = 0; x < MW; x++)
  set(x, y, 238, 202, 166, Math.round(((y - 388) / (MH - 388)) * 70));
function shadow(cx, cy, rx, ry) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++)
    if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) set(cx + x, cy + y, 222, 182, 148, 75);
}

// scaled nearest-neighbour blit of a 64×64 sprite buffer
function blit(sp, ox, oy, sc) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (y > 52) continue; // drop the sprite's built-in contact shadow (gen-art shadow @ y~55-59)
    const a = sp[(y * W + x) * 4 + 3]; if (!a) continue;
    const r = sp[(y * W + x) * 4], g = sp[(y * W + x) * 4 + 1], b = sp[(y * W + x) * 4 + 2];
    for (let sy = 0; sy < sc; sy++) for (let sx = 0; sx < sc; sx++) set(ox + x * sc + sx, oy + y * sc + sy, r, g, b, a);
  }
}

// pixel deco
const PINK = [255, 138, 160], YEL = [255, 209, 102], ORG = [245, 160, 90];
function heart(cx, cy, sc, c) {
  const P = ["01010", "11111", "11111", "01110", "00100"];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (P[y][x] === "1")
    for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) set(cx + x * sc + a, cy + y * sc + b, c[0], c[1], c[2]);
}
function star(cx, cy, sc, c) {
  const P = ["00100", "00100", "11111", "01110", "01010"];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (P[y][x] === "1")
    for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) set(cx + x * sc + a, cy + y * sc + b, c[0], c[1], c[2]);
}

// 3) all 6 本命宠 in one slightly-overlapping row — every face visible (group photo)
const PETS = [["puff", "child"], ["seal", "child"], ["claude", "child"], ["blocky", "child"], ["bear", "child"], ["penguin", "child"]];
const SC = 3, groundY = 360, step = 95;
const startCx = (MW - (PETS.length - 1) * step) / 2;
PETS.forEach(([line, stage], i) => {
  const cx = startCx + i * step;
  shadow(cx, 350, 44, 9);
  blit(renderBuf(line, "true", stage, "happy"), cx - 32 * SC, groundY - 64 * SC + 22, SC);
});

// 4) scattered hearts/stars up top (空中点缀)
heart(70, 60, 5, PINK); star(170, 40, 4, YEL); heart(300, 30, 4, PINK);
star(430, 48, 5, YEL); heart(520, 70, 5, ORG); star(250, 90, 3, YEL);
heart(390, 80, 3, PINK); star(90, 130, 3, ORG);

mkdirSync(join(ROOT, "miniprogram/assets/share"), { recursive: true });
mkdirSync(join(ROOT, "docs/review"), { recursive: true });
const png = encode(buf, MW, MH);
writeFileSync(join(ROOT, "miniprogram/assets/share/cover.png"), png);
writeFileSync(join(ROOT, "docs/review/share-cover.png"), png);
console.log(`share cover ${MW}x${MH} → miniprogram/assets/share/cover.png (${(png.length / 1024).toFixed(0)} KB)`);
