# 美术管线 (Art Pipeline)

> ⚠️ **过时提示（V8 roster）**：本文档成文于早期 **10 原型 / “3 只 + 7 占位”** 方案，其中具体怪物名（布丁团子 / 影狐 / 夜灯蛾 / `mochi_pudding` / `echo_fox` …）**均已退役**。线上实际是 **6 只全量怪**：奶团 `puff` / 克劳德 `claude` / 方头崽 `blocky` / 波波企鹅 `penguin` / 墩墩熊 `bear` / 团团海豹 `seal`。当前图谱与真相源见 **`docs/BESTIARY.md`** + `web/src/data/{personality.ts,lines.json,bestiary.ts}`。下文的系统/设计思路多数仍适用，只把怪物名当历史示例读。


This is a pure design task with no LLM/Claude integration at runtime — the product explicitly forbids it. I'll produce the spec directly. No tools needed.

# 云宠物 — AI Pixel-Art Pipeline & Style Spec (V1)

A reusable art SYSTEM for 10 unusual-cute creatures, each with growth stages + moods. Built to ship offline-first, with a placeholder path that lets the full game loop run *today* and a clean swap-in for curated AI art later.

---

## 1. STYLE GUIDE — one world, 10 weird-but-adorable critters

The job of the style is to make a jelly blob, a fox, a moth, and a clay golem feel like they live in the *same* toybox. Cohesion comes from **constraints**, not from making them look alike.

### 1.1 Canvas & sizing

| Asset role | Native canvas | Pixel grid | Notes |
|---|---|---|---|
| **Hero sprite** (in-app pet view) | **128×128** | drawn on a **64×64 logical grid**, 2× scaled | Generate at 128, but the "true pixels" are 2px blocks → crisp on Retina, room for expressive faces. |
| **Card / quiz reveal** | reuse 128×128 hero | — | Same file, presented larger. |
| **List/roster thumbnail** | **64×64** | downscaled from hero, hand-checked | One per creature×stage (idle mood only). |
| **UI badge / mood icon** | **32×32** | tiny, flat | Status-flag glyphs (SICK/SULKY/HIDING etc.), shared across creatures, not per-creature. |

Single source of truth = the **64-logical-grid hero**. Everything else derives down from it. Never author tiny then upscale.

### 1.2 Outline

- **Selective dark outline.** Full exterior silhouette gets a 1-logical-px outline in a **near-black tinted toward the creature's hue** (not pure `#000` — use a very dark desaturated version of the body color, e.g. body `#7FD1C4` → outline `#234642`). This keeps 10 different creatures from looking like a clip-art sticker pack.
- **Interior lines are lighter / partial.** Internal separations (a limb over a body, mouth, belly seam) use a darker shade of the *adjacent* fill, not the black outline → softer, rounder, cuter read.
- **No anti-aliasing on the logical grid.** Edges are hard. (AA, if any, only appears as the deliberate 2× presentation scale — see post-process.)

### 1.3 Shading

- **Flat cel shading, 3 tones per material**: base, one shadow (−value, slight hue shift toward blue/purple), one highlight (+value, slight hue shift toward warm). That's the whole ramp. No gradients.
- **One light source, top-left**, consistent across all 10 and all stages. Shadow pools bottom-right; a single highlight pip top-left on rounded forms and one specular dot in each eye.
- **Dithering: sparingly, and only as texture, never as a gradient.** Allowed for: a soft belly glow, a translucent jelly/water-membrane (mochi, dream_jelly), a fuzzy moth wing. A 2px checker dither at material boundaries is fine; full-form dither ramps are **banned** (they read as "old PC art," not cute).
- **Eyes are the cuteness budget.** Big, simple, 1 highlight pip + optional lower "shine" pixel. Expression lives almost entirely in eyes + mouth + brow-pixel. Keep everything else simple so faces carry the charm.

### 1.4 Palette discipline (the real cohesion lever)

Three tiers, locked:

1. **SHARED WORLD PALETTE (32 colors, fixed).** One master `.gpl`/`.hex` palette every sprite must quantize to. Split as:
   - 6 neutral/structure tones (the tinted-darks for outlines, plus 2 shadow-violets, 2 warm-highlights, 1 true-ish white-cream `#FFF7E6` — *never pure white*).
   - 26 "world hues" arranged as ~9 hue families × 3 tones (base/shadow/highlight).
2. **PER-CREATURE SUB-PALETTE (max 4 hue families = 12 fills + outline + 1 accent).** Each creature is *assigned* a slice of the world palette as its identity. Discipline rule: **a creature may use at most 4 of the 9 hue families.** This is what makes 10 critters feel like one set — they're all drawn from the same 32 crayons, just different handfuls.
3. **SHARED ACCENT + BACKGROUND.** A single warm cream `#FFF7E6` for in-eye shine / sparkle accents and a single app background gradient (cream→soft peach) that lives in the *UI*, not the sprite. Sprites themselves ship on **transparent alpha**.

Mood is expressed by **palette modulation of the same base sprite where possible**, not a fully repainted sprite:
- **happy** = base palette, +1 highlight, sparkle accent pixels.
- **sad/sick** = global desaturate ~25% + value −10% + swap accent to a muted gray-green (the "sick tint"). Applied as a deterministic palette remap, so it's consistent across all 10 and cheap to author.
- **sleeping** = value −8%, eyes → closed `‿` line, "Zzz" accent.

This means a lot of mood variants are **palette transforms of the idle sprite**, not net-new drawings — huge production savings, enforced consistency (see §2 and §3).

### 1.5 Silhouette & proportion rules (cohesion for *shape*, not just color)

- **Chibi ratio:** head/face mass ≈ 50–60% of the sprite. Tiny or implied limbs. Everything reads as "a face with a body attached."
- **Rounded, blobby base forms.** No sharp spikes even on the fire/electric critters — their "spiky" energy is shown via accent pixels and animation, not pointy silhouettes. Keeps the cute through-line.
- **Silhouette test:** each creature must be identifiable as a pure black silhouette at 64px. If two creatures share a silhouette, redesign one.
- **Grounding:** a single soft 1px contact-shadow ellipse *baked into the hero at the feet* (semi-transparent dark-violet), so the pet sits in the world rather than floating. (Omit for floaty species: wisp_moth, dream_jelly — they get a faint hover glow instead.)

### 1.6 DO / DON'T

**DO**
- Quantize every final asset to the 32-color world palette. No off-palette pixels.
- Keep the top-left light source on every sprite/stage/mood.
- Carry one identity accent color per creature across all its stages (egg shell hints at it).
- Let eyes + mouth do the emotional work; keep bodies simple.
- Author at 64-logical, export at 128, with hard pixel edges.

**DON'T**
- No pure black (`#000`) outlines or pure white (`#FFF`) fills — always tinted.
- No gradient shading, no full-form dither ramps, no soft AA on the logical grid.
- No realistic anatomy, no spiky/scary silhouettes, no more than 4 hue families per creature.
- No baked-in background, no drop shadows beyond the single contact ellipse.
- No common cat/dog/rabbit reads — if it could be mistaken for a normal pet, push it weirder (extra eye, jelly translucency, leaf sprout, glow).
- Don't let mood variants drift in palette — sick/sleep/happy are *deterministic remaps* of idle, not free repaints.

---

## 2. SPRITE MATRIX — what each creature needs, and the V1 subset

### 2.1 Dimensions

- **Creatures:** 10 (the archetype keys: `mochi_pudding, sproutling, ember_imp, stone_egg, echo_fox, puff_seal, wisp_moth, clay_golem, spark_sprite, dream_jelly`).
- **Growth stages:** 5 (`egg, baby, child, teen, adult`) — but the **egg stage is shared-shape**: every creature's egg is the *same egg silhouette* tinted with that creature's identity accent + a hint motif (a leaf crack for sproutling, a spark for spark_sprite). So egg art ≈ 1 base egg × 10 tints, not 10 bespoke drawings.
- **Moods/poses:** the full intended set is **5** — `idle, happy, eating, sad/sick, sleeping`.

### 2.2 Full (ideal) count

Per creature, the meaningful drawable stages are **baby, child, teen, adult = 4** (egg handled separately). 4 stages × 5 moods = 20, ×10 creatures = **200**, plus egg (10 tints) = **210 hero sprites** at full ambition.

But mood is *mostly palette-remappable* (§1.4): **sad/sick and sleeping are deterministic transforms** of idle; **happy** is idle + a small overlay. So the number of **hand-authored base sprites** is far lower than 210.

### 2.3 What's actually *authored* vs *derived*

| Mood/pose | Production method | Authored? |
|---|---|---|
| **idle** | the canonical base drawing per stage | ✅ authored |
| **happy** | idle + highlight bump + sparkle overlay (deterministic) | ⚙️ derived (overlay) |
| **eating** | needs a real pose change (mouth open / nibble) | ✅ authored (lightweight, can reuse idle body) |
| **sad/sick** | idle → desaturate+value+sick-tint remap | ⚙️ derived (palette) |
| **sleeping** | idle → value −8% + closed-eye overlay + Zzz | ⚙️ derived (palette+overlay) |

So **authored = idle + eating** per stage. That's **2 authored × 4 stages × 10 = 80 authored hero sprites**, + 10 egg tints = **90 authored**. The other 120 mood variants are generated by the deterministic remap/overlay pipeline at build time → consistent and nearly free.

### 2.4 RECOMMENDED V1 SHIP SUBSET

Ship the **emotionally legible minimum** and expand by stage popularity, *not* by cutting moods uniformly.

**V1 = `idle` + `happy` + `sad/sick` + `sleeping` for ALL stages, `eating` deferred:**

- Authored base = **idle only**: 4 stages × 10 = 40, + 10 eggs = **50 authored idle sprites**.
- happy / sick / sleeping = derived (overlay/remap) → **free** at build time, full coverage.
- **eating = DEFERRED** to V1.1 (it's the only mood needing a true second pose; in V1 the "feeding" animation reuses `happy` + a food prop sprite floating to the mouth — see §5).

This gives the player a pet that visibly idles, lights up happy, droops when sick, and sleeps — across all 5 stages — from **50 authored sprites**, with 3 more moods derived for free (150 rendered files) and a fully convincing feed loop via a prop, *without* drawing 80–210 sprites first.

### 2.5 DEFERRAL LOG (so coverage isn't silently cut)

| Deferred item | Why deferred | Re-add trigger |
|---|---|---|
| **`eating` authored pose** (40 sprites) | needs a bespoke open-mouth pose; `happy`+food-prop covers the loop convincingly in V1 | V1.1, once base set is curated & a creature's "loved food" reaction is a marketing beat |
| **Mood-specific *animation* frames** (only idle gets a 2-frame loop in V1; see §5) | per-mood multi-frame anim explodes counts | when a creature graduates to "hero of the week" featured content |
| **Seasonal / 本命 adult variants** | adult-stage cosmetic skins (spec'd as an adult unlock) | post-V1 live-ops |
| **`teen` mood breadth** | teen is a short transitional stage; can launch with idle/happy only and fall back to child art for sick/sleep if curation is behind | only if the art queue slips; logged as acceptable temporary fallback |
| **Directional poses (left/right facing)** | V1 is single-facing; mirror in-engine if needed | post-V1 |

Net V1 commitment: **50 authored idle hero sprites + 1 shared egg base** → 150 rendered hero files (3 derived moods) + 10 egg tints. Everything else is explicitly logged above, not silently dropped.

---

## 3. GENERATION PROMPT TEMPLATE

Reusable text-to-image template with `{slots}`. Designed for a modern diffusion image model, tuned to emit clean, near-pixel art that the **post-process step finishes into true pixels** (no current model reliably emits a perfect pixel grid — we generate *close*, then quantize/snap).

### 3.1 The template (literal)

```
PIXEL ART SPRITE — single centered character, full body, front view.

Subject: {creature_appearance}
Growth stage: {stage_descriptor}   // e.g. "tiny rounded baby form, oversized head, stubby/implied limbs, extra-large sparkling eyes"
Mood/pose: {mood_descriptor}        // e.g. "calm idle, gentle closed smile, relaxed"

STYLE (fixed):
chibi pixel art, drawn on a 64x64 logical pixel grid, hard pixel edges, NO anti-aliasing,
flat cel shading with exactly 3 tones per material (base + one cool shadow + one warm highlight),
single light source from the TOP-LEFT, one specular pip in each eye,
selective outline: dark tinted-to-hue outline on the silhouette only (NEVER pure black),
soft rounded blobby silhouette, head is ~55% of the body, adorable, original creature
(NOT a normal cat/dog/rabbit), readable as a clean silhouette.

PALETTE (strict): use ONLY these colors — {palette_hex_list}
cream accent for eye-shine and sparkles {accent_hex}; never pure white, never pure black.

COMPOSITION: character centered, fully inside frame with small margin, feet near lower third,
single soft contact-shadow ellipse under the feet (or faint hover glow if floating species: {is_floating}).
BACKGROUND: solid flat {chroma_key_hex} background, no scenery, no props, no text, no UI, no border.

Output a crisp, high-contrast pixel sprite suitable for downscaling to a 64px grid.
```

### 3.2 Negative prompt (fixed)

```
NEGATIVE: anti-aliasing, blurry, soft gradients, gradient shading, full-image dithering,
3D render, smooth vector, glossy, photorealistic, realistic anatomy, fur detail, painterly,
drop shadow, motion blur, multiple characters, duplicated limbs, extra eyes (unless specified),
text, watermark, signature, logo, UI elements, frame, border, checkerboard transparency pattern,
busy background, scenery, props, pure black (#000000) outline, pure white (#FFFFFF) fill,
spiky/scary/aggressive silhouette, off-palette colors, cropped, cut off, tiny in frame.
```

### 3.3 Slot-fill conventions

| Slot | Filled from | Example |
|---|---|---|
| `{creature_appearance}` | bestiary entry's `vibe` distilled to a visual noun phrase | "a translucent jelly pudding blob that wobbles, soft and squishy, with a tiny content face" (mochi) |
| `{stage_descriptor}` | fixed per-stage string (5 canned values, reused across all creatures) | egg / baby / child / teen / adult descriptors |
| `{mood_descriptor}` | fixed per-mood string (5 canned values) | idle / happy / eating / sad-sick / sleeping |
| `{palette_hex_list}` | the creature's assigned ≤4 hue families from the world palette | `#7FD1C4,#5BA89C,#B8EDE3,#234642,...` |
| `{accent_hex}` | shared `#FFF7E6` | constant |
| `{chroma_key_hex}` | a color NOT in any creature palette, e.g. magenta `#FF00FF` | constant — keyed out in post |
| `{is_floating}` | bestiary flag | true for wisp_moth, dream_jelly |

> **Why chroma-key instead of "transparent background" in the prompt:** diffusion models don't reliably render alpha; a flat off-palette key color quantizes and keys out far more cleanly. Alpha is produced in post.

### 3.4 Post-process pipeline (every generated frame → shippable sprite)

Deterministic, scriptable (ImageMagick / Pillow / `aseprite` CLI):

1. **Generate** at high res (e.g. 512–1024) for model quality.
2. **Chroma-key → alpha:** flood-fill / color-key the `#FF00FF` background to transparent; despeckle key halos.
3. **Snap to grid:** downscale to **64×64 nearest-neighbor** (the logical grid), choosing the downscale phase that maximizes edge alignment (try a couple offsets, pick sharpest).
4. **Quantize to the 32-color world palette** (`pngquant`/indexed remap, no dithering) → forces palette discipline, kills off-palette stragglers.
5. **Outline cleanup:** re-darken silhouette outline to the creature's tinted-dark; remove orphan/stray pixels (<2px islands).
6. **Alpha-trim & recenter:** trim to content bbox, recenter on a fixed 64×64 canvas with locked baseline (feet at row 56) so all stages/moods register identically.
7. **Export:**
   - `hero` 128×128 (2× nearest-neighbor of the 64 grid),
   - `thumb` 64×64 (the grid itself).
8. **Derive moods (build-time, deterministic):** from the cleaned `idle`:
   - `happy` = idle + highlight LUT bump + sparkle overlay,
   - `sad/sick` = desaturate 25% + value −10% + sick-tint accent remap,
   - `sleeping` = value −8% + closed-eye overlay + Zzz.
   These are palette LUTs/overlays applied in the same script → guaranteed consistency, no model call.
9. **Human curation gate:** an artist approves/rejects each `idle`; rejects get re-prompted. Only `idle` needs human review — derived moods inherit approval.

---

## 4. PLACEHOLDER STRATEGY — full game loop runs *before* any art exists

Goal: the engine, copy bank, stat sim, and animations are testable **today**, and real sprites drop in with **zero code change** — only files appearing on disk.

### 4.1 Stable naming convention (the contract)

```
assets/pets/<creatureId>/<stage>_<mood>.png
assets/pets/<creatureId>/egg.png            // egg has no mood
assets/pets/_placeholder/<stage>_<mood>.png // generic fallback chain
```

- `creatureId` ∈ the 10 archetype keys.
- `stage` ∈ `egg|baby|child|teen|adult`.
- `mood` ∈ `idle|happy|eating|sad|sleeping`.
- Example: `assets/pets/mochi_pudding/baby_idle.png`.

The renderer **always** resolves a sprite through this path. Placeholders live at the *same paths*; swapping in real art = dropping real PNGs at those exact names. No manifest edit, no rebuild logic.

### 4.2 Fallback resolution chain (so missing art never crashes)

When resolving `(<creatureId>, <stage>, <mood>)`:
1. `assets/pets/<creatureId>/<stage>_<mood>.png` (ideal)
2. → `assets/pets/<creatureId>/<stage>_idle.png` (mood missing → use idle: covers deferred `eating`/teen breadth)
3. → `assets/pets/<creatureId>/<prevStage>_<mood>.png` (stage art behind → fall back one stage, e.g. teen→child — the logged teen fallback)
4. → `assets/pets/_placeholder/<stage>_<mood>.png` (generic)
5. → `assets/pets/_placeholder/baby_idle.png` (last resort)

This chain *is* the mechanism that lets the deferral log (§2.5) be safe: deferred art silently and gracefully degrades to the nearest available sprite, never a broken image.

### 4.3 Placeholder art generator (programmatic, on-palette, "good enough to feel real")

Don't ship emoji — ship **deterministic colored-blob PNGs** so the layout, sizing, baseline, and mood tints are already correct (a real test of the §1.4 mood-remap pipeline):

- A tiny build script generates, for each `(creatureId, stage, mood)`:
  - a **rounded blob** in the creature's assigned identity accent color (from the world palette — so the world already looks cohesive),
  - **size by stage** (egg smallest → adult largest, on the locked 64-grid baseline),
  - **two dot eyes + a mouth** whose shape encodes mood (`idle` = `·-·`, `happy` = `^◡^`, `sad` = `·︵·`, `sleeping` = `-‿-` + Zzz, `eating` = open `o`),
  - the **same deterministic mood remap** (sick desaturate, sleep dim) used for real art → exercises that code path now,
  - a baked **contact-shadow ellipse** (or hover glow for floating species).
- Output straight to the canonical paths. Result: a recognizable, color-coded, mood-correct "proto-pet" per cell — enough to demo bonding, quiz reveal, decay, and soft-fail states convincingly, and to screenshot for stakeholder review.

> Implementation: ~1 Pillow/SVG script, fully deterministic (seeded by `hash(creatureId)`), regenerates the entire placeholder set in seconds. Stored under `assets/pets/` so the miniprogram bundles them exactly like final art.

### 4.4 Swap-in path

1. Artist/AI pipeline (§3) produces a real `mochi_pudding/baby_idle.png`.
2. Drop it at the canonical path; build picks it over the placeholder automatically (real art dir shadows `_placeholder`).
3. Derived moods regenerate from the new real `idle` via the same §3.4 step-8 script.
4. No code touched. Coverage dashboard = "count real PNGs vs full matrix" against the §2.5 log.

---

## 5. INTEGRATION — bundling into the WeChat miniprogram

WeChat constraints: **main package ≤ 2MB**, total with subpackages larger but each subpackage ≤ 2MB; fewer files & smaller payload = faster cold start.

### 5.1 What ships where (package budgeting)

- **Main package (≤2MB):** engine, copy bank (data, gzipped JSON), UI chrome, and **only the user's bonded creature is loaded at runtime** (one pet per user). So the main package needs the *quiz/onboarding* visuals + a tiny generic egg, not all 10 creatures.
- **Per-creature subpackages:** put **each creature's full sprite set in its own subpackage** `packageA/pets/<creatureId>/`. The user downloads **only their bonded creature's** subpackage on hatch (lazy-loaded via `requiredBackgroundModules`/subpackage `preloadRule` keyed off the quiz result). 9 of 10 creatures' art never touches that user's device.
- **Size math:** one creature = 5 stages × (1 idle + 3 derived moods) ≈ 20 hero PNGs. As an **indexed-palette PNG sprite-sheet** (see below) on a 32-color shared palette, a creature's sheet is comfortably **~80–200KB** — trivially inside a 2MB subpackage, with the whole 10-creature catalog far under any single-package limit because it's *partitioned per creature*.

### 5.2 Sprite-sheet vs individual files → **sprite-sheet, per creature**

- **One PNG atlas per creature** (`<creatureId>.png`) packing its stage×mood frames in a fixed grid, + a tiny `<creatureId>.json` with frame rects. Reasons: one network request & one decode instead of ~20; better PNG compression (shared palette across frames); fewer files in the package (WeChat dislikes thousands of tiny assets).
- All atlases **share the same 32-color indexed palette** → maximal PNG deflate, and visually enforces §1.4 cohesion.
- Frames laid out on the locked 64-grid with the fixed baseline, so swapping frames never shifts the pet.

### 5.3 Cheap idle animation (no skeletal rig, no heavy engine)

Personality-gated micro-motion (the bestiary calls for mochi jiggle, stone_egg stillness, spark_sprite vibrate) achieved **without per-frame animation art**:

- **V1 baseline = 2-frame idle loop** (`idle` + a 1px-offset "breathe" frame auto-generated in post-process: squash/stretch the idle by 1 logical px vertically). Cross-fade-free, just swap at ~2–3fps. Costs **one extra frame per stage** (cheap; auto-derived, not authored).
- **Transform-based personality motion (zero extra art):** drive a small per-archetype tween on the *single sprite* via CSS-like transforms on the canvas/`<image>`:
  - `mochi` → vertical scale jiggle (squash-stretch sine),
  - `stone_egg` → nearly static (tiny periodic blink only),
  - `spark_sprite` → 1–2px positional jitter,
  - `wisp_moth`/`dream_jelly` → slow vertical bob (hover),
  - `ember_imp` → quick scale "pop" on mood flips.
  These read as distinct "personalities in motion" from **the same static frames** — pure transform params in the archetype lookup table, no extra assets.
- **Mood/state animations** (sneeze when SICK, pout when SULKING, Zzz when sleeping, peek when HIDING) = **overlay sprites + transform**, not redrawn pets: a small shared FX atlas (Zzz, sparkle, sweat-drop, sneeze-puff, heart) overlaid on the base, reused across all 10 creatures. One tiny shared FX sheet (~10KB) covers every creature's emotional FX.
- **Feeding loop (covers deferred `eating`):** show `happy` frame + a food-prop sprite (from the shared item atlas) tweening to the mouth, then a sparkle FX. No bespoke eating pose needed in V1.
- **Rendering:** WeChat `canvas 2d` (or layered `<image>` for the simplest path) at 2–3fps swap + requestAnimationFrame transform tween. Negligible CPU/GPU; battery-friendly; works on low-end devices.

### 5.4 Asset coverage dashboard (ties back to /status & the deferral log)

A build step counts real PNGs present vs the full §2.2 matrix and emits a coverage number; surface it on the project's `/status` group so the operator can see "real art: 18% (placeholders covering the rest)" without opening the repo — and the §2.5 deferral log is the canonical list of what *intentionally* reads as missing.

---

### One-paragraph summary

Author **only `idle` sprites** (50 of them: 4 stages × 10 + a shared egg), generate `happy/sad/sleeping` for free via deterministic palette remaps, and defer authored `eating` (the food-prop trick covers it). Enforce cohesion with a **locked 32-color world palette + ≤4 hue families per creature + one top-left light + chibi blob silhouettes**. Generate with the chroma-keyed pixel-art prompt template, then **chroma-key→snap-to-64-grid→quantize→trim** in post. Run the whole game *now* on deterministic on-palette blob placeholders living at the canonical `assets/pets/<creatureId>/<stage>_<mood>.png` paths, with a graceful fallback chain so deferred art degrades instead of breaking. Ship per-creature **indexed-palette sprite-sheets in per-creature subpackages** (only the bonded pet downloads), animate via **2-frame idle + per-archetype transform tweens + a shared FX overlay atlas** — cheap, cohesive, and swap-in-ready with zero code changes.
