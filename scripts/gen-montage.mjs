// Quick visual-QA montage: penguin/bear/seal × (true + 3 forms) at teen, upscaled, tiled
// into one PNG for eyeball review. Usage: node scripts/gen-montage.mjs [mood]
import { renderBuf, encode, LINES, W, H } from "./gen-art.mjs";
import { writeFileSync } from "node:fs";

const mood = process.argv[2] || "idle";
const SCALE = 3, PAD = 8;
const lines = ["penguin", "bear", "seal"];
const formsFor = (id) => ["true", ...Object.values(LINES[id].branches).map((b) => b.variant)];

const cols = 4, cellW = W * SCALE + PAD, cellH = H * SCALE + PAD;
const GW = cols * cellW + PAD, GH = lines.length * cellH + PAD;
const out = new Uint8ClampedArray(GW * GH * 4);
for (let i = 0; i < GW * GH; i++) { out[i * 4] = 28; out[i * 4 + 1] = 30; out[i * 4 + 2] = 38; out[i * 4 + 3] = 255; }

function blit(buf, ox, oy) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const si = (y * W + x) * 4; if (!buf[si + 3]) continue;
    for (let sy = 0; sy < SCALE; sy++) for (let sx = 0; sx < SCALE; sx++) {
      const X = ox + x * SCALE + sx, Y = oy + y * SCALE + sy; if (X < 0 || Y < 0 || X >= GW || Y >= GH) continue;
      const di = (Y * GW + X) * 4; out[di] = buf[si]; out[di + 1] = buf[si + 1]; out[di + 2] = buf[si + 2]; out[di + 3] = 255;
    }
  }
}
lines.forEach((id, r) => formsFor(id).forEach((v, c) => blit(renderBuf(id, v, "teen", mood), PAD + c * cellW, PAD + r * cellH)));
writeFileSync("/home/liharr/uploads/montage_v8.png", encode(out, GW, GH));
console.log(`montage ${GW}x${GH} (${mood}) · rows penguin/bear/seal · cols true+3 -> uploads/montage_v8.png`);
