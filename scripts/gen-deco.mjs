// 可装饰 decoration engine — procedural pixel HATS (one head slot for V1), drawn with the SAME
// raster toolkit as the creatures so the style matches. Each hat is a 64×64 transparent PNG with
// its CONTACT line (where it meets the head) centered at x=32, row HAT_BASE. The client overlays
// the hat over the sprite and translates it so the contact row lands on the creature's real
// head-top (from headAnchor) — so ONE asset per hat fits every creature/stage. Also emits the
// head-anchor table (client TS + web JSON) the placement math reads.
//
// Run: node scripts/gen-deco.mjs   (writes miniprogram/assets/deco/*.png, web/public/deco/*.png,
//      miniprogram/utils/anchors.ts, web/src/data/head-anchors.json)

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canvas, encode, disc, ell, rrect, tri, stroke, px, LINES, headAnchor } from "./gen-art.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DECO_MP = join(ROOT, "miniprogram/assets/deco");
const DECO_WEB = join(ROOT, "web/public/deco");

export const HAT_BASE = 30; // canvas row where a hat's contact line sits (lands on the head-top)
// the face-box top sits a hair above the visual crown of these fluffy heads, so hats read as
// floating ~3px; drop them this many canvas px to rest ON the head (client + QA share this).
export const HAT_DROP = 3;
const B = HAT_BASE;

// palette
const GOLD = [243, 196, 78], GOLD_D = [206, 158, 52];
const RED = [221, 74, 74], RED_D = [176, 52, 52], WHITE = [250, 250, 250];
const STRAW = [226, 192, 120], STRAW_D = [196, 158, 92];
const PINK = [243, 150, 178], PINK_D = [214, 110, 142], LEAF = [142, 196, 110];
const PURP = [122, 96, 168], PURP_D = [92, 70, 132], STAR = [248, 224, 120];
const BLUE = [110, 150, 200], MINT = [150, 210, 180];

// each hat draws into a fresh 64-canvas; contact line centered at (32, B)
export const HATS = {
  // 毛线帽 — rounded beanie + pom
  beanie(b) {
    rrect(b, 32, B - 6, 13, 8, 7, RED);
    rrect(b, 32, B - 1, 14, 3, 2, WHITE);          // folded brim
    disc(b, 32, B - 14, 3, WHITE);                  // pom
    for (let x = 20; x <= 44; x += 3) px(b, x, B - 1, RED_D, 120);
  },
  // 草帽 — wide brim + low dome
  straw(b) {
    ell(b, 32, B, 22, 3, STRAW);                    // brim
    ell(b, 32, B + 1, 22, 2, STRAW_D, 140);
    rrect(b, 32, B - 5, 11, 6, 5, STRAW);           // dome
    stroke(b, 21, B, 43, B, 0, STRAW_D);
    rrect(b, 32, B - 2, 11, 1, 0, RED, 160);        // band
  },
  // 小皇冠 — gold zigzag + gems
  crown(b) {
    rrect(b, 32, B - 1, 13, 2, 1, GOLD);            // band
    for (const x of [-10, 0, 10]) tri(b, 32 + x - 4, B - 1, 32 + x + 4, B - 1, 32 + x, B - 9, GOLD);
    for (const x of [-10, 0, 10]) px(b, 32 + x, B - 8, RED);   // tip gems
    for (let x = 19; x <= 45; x++) px(b, x, B, GOLD_D, 150);   // base shade
  },
  // 派对帽 — striped cone + pom
  party(b) {
    tri(b, 24, B, 40, B, 32, B - 16, MINT);
    for (let i = 0; i < 4; i++) tri(b, 27 + i * 0, B - i * 4, 37, B - i * 4, 32, B - 4 - i * 4, i % 2 ? PINK : WHITE);
    // simpler stripes: overlay two bands
    stroke(b, 27, B - 5, 37, B - 5, 0, PINK);
    stroke(b, 29, B - 10, 35, B - 10, 0, PINK);
    disc(b, 32, B - 17, 2, PINK);                   // pom
    ell(b, 32, B, 9, 1, MINT, 180);
  },
  // 小花 — single cute flower, sits to one side
  flower(b) {
    const cx = 25, cy = B - 4;
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, -2], [-2, 2], [2, 2]]) disc(b, cx + dx, cy + dy, 2, PINK);
    disc(b, cx, cy, 2, STAR);                        // center
    stroke(b, cx + 2, cy + 3, cx + 5, cy + 6, 0, LEAF); // tiny stem
  },
  // 蝴蝶结 — ribbon bow
  bow(b) {
    tri(b, 32, B - 4, 23, B - 9, 23, B + 1, RED);
    tri(b, 32, B - 4, 41, B - 9, 41, B + 1, RED);
    tri(b, 32, B - 4, 25, B - 7, 25, B - 1, RED_D);  // inner shade
    tri(b, 32, B - 4, 39, B - 7, 39, B - 1, RED_D);
    rrect(b, 32, B - 4, 2, 3, 1, RED_D);             // knot
    px(b, 30, B - 4, WHITE); px(b, 34, B - 4, WHITE);
  },
  // 巫师帽 — tall bent witch hat + star (endgame)
  wizard(b) {
    ell(b, 32, B + 1, 18, 3, PURP_D);                // brim
    ell(b, 32, B, 18, 2, PURP);
    // bent cone
    let x = 32;
    for (let y = B - 1; y >= B - 20; y--) { const w = Math.max(1, Math.round((y - (B - 21)) * 0.55)); if (y < B - 12) x += 0.35; rrect(b, Math.round(x), y, w, 1, 0, y < B - 12 ? PURP : PURP_D); }
    rrect(b, 32, B - 3, 14, 1, 0, STAR, 200);        // band
    // star near tip
    const sx = Math.round(x), sy = B - 19;
    px(b, sx, sy - 2, STAR); px(b, sx, sy + 2, STAR); px(b, sx - 2, sy, STAR); px(b, sx + 2, sy, STAR); disc(b, sx, sy, 1, STAR);
  },
};

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  // ---- write hat PNGs ----
  mkdirSync(DECO_MP, { recursive: true });
  mkdirSync(DECO_WEB, { recursive: true });
  let n = 0;
  for (const [id, draw] of Object.entries(HATS)) {
    const b = canvas();
    draw(b);
    const png = encode(b);
    writeFileSync(join(DECO_MP, `${id}.png`), png);
    writeFileSync(join(DECO_WEB, `${id}.png`), png);
    n++;
  }

  // ---- emit head-anchor table for every species_id × stage ----
  const anchors = {};
  const put = (sid, stage, a) => { (anchors[sid] ||= {})[stage] = a; };
  for (const [lineId, line] of Object.entries(LINES)) {
    for (const stage of ["baby", "child", "teen", "adult"]) put(lineId, stage, headAnchor(lineId, "true", stage));
    for (const br of Object.values(line.branches)) for (const stage of ["teen", "adult"]) put(`${lineId}__${br.variant}`, stage, headAnchor(lineId, br.variant, stage));
  }
  writeFileSync(join(ROOT, "web/src/data/head-anchors.json"), JSON.stringify(anchors, null, 0) + "\n");
  const tsHeader = "// AUTO-GENERATED by scripts/gen-deco.mjs — head-top anchors (64-canvas coords) for hat placement.\n// Do not edit by hand; rerun the generator.\n";
  writeFileSync(join(ROOT, "miniprogram/utils/anchors.ts"),
    `${tsHeader}export const HAT_BASE = ${HAT_BASE};\nexport const HAT_DROP = ${HAT_DROP};\nexport const HEAD_ANCHORS: Record<string, Record<string, { x: number; y: number }>> = ${JSON.stringify(anchors, null, 0)};\n`);

  console.log(`rendered ${n} hats; anchors for ${Object.keys(anchors).length} species written.`);
}
