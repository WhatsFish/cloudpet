# 云宠物 (cloudpet) — PLAN.md

> Canonical design + build plan. This document is the single source of truth the team builds from. It resolves the known inconsistencies and gaps inline (it is not an append of the critique). Companion docs referenced: `docs/BESTIARY.md` (full per-creature art specs) and `docs/COPYBANK_AUTHORING.md` (the writers' style bible).

---

## 1. 云宠物 — Vision

**云宠物** is a WeChat mini-game where you take a fun 6–8 question 性格测试, get matched to exactly **one fated "本命宠"** — a cute-but-unusual original pixel critter (a wobbling pudding, an ink-smoke fox, a temper-tantrum flame, a lantern moth — explicitly *not* a cat/dog/rabbit) — and raise it through real wall-clock time. It runs on **QQ宠物 / Tamagotchi nostalgia and Claude-`/buddy` energy**: a distinctive original mascot you genuinely bond with. The personality "soul" is **100% rule-based** — no LLM at runtime — so it works offline and deterministically; the felt aliveness comes entirely from a richly-authored, personality-segmented **copy bank** plus contextual rotation. Stakes are **soft and reversible**: the pet gets hungry, dirty, sulky, sick, can 闹脾气/赌气/离家躲起来, but **never dies and is never lost**. Cozy with gentle stakes, not death.

**Chinese app-name shortlist** (cute, passes 行业审核, frames as 领养/养成/测试 — never 抽奖/赌/扭蛋):
1. **本命小宠** ⭐ (primary) — leans into the fated one-pet bond, no gambling read.
2. **像素小宠养成记** (review-safest fallback) — names the genre plainly, 养成 framing.
3. **测测你的本命宠** — foregrounds the 性格测试 as 测试, not 抽奖.
4. **领养一只小怪** — 领养 framing, signals the weird-but-cute critters.
5. **口袋小怪兽** — cozy collectible vibe, no risky terms.

**Chosen english repo slug:** `cloudpet` → **`WhatsFish/cloudpet`** (public). Threads consistently through: VM service `<name>`=`cloudpet`, DB role+db=`cloudpet`, heartbeat job=`cloudpet-tick`, basePath=`/cloudpet`, port=`3012`.

---

## 2. 产品决策 (locked)

1. **性格引擎 = 纯规则脚本，零运行时 LLM。** Personality is a data struct `{attach, curio, express}` + a denormalized `archetype_key`. It deterministically drives (a) personality-flavored **canned copy** from a segmented bank, (b) **stat-decay modifiers**, (c) **animation choices**. Fully offline. **Consequence:** the copy bank + contextual variety *is* the product's soul — treated as the heart, not an afterthought.
2. **软性·可逆的代价。** Live stats decay over real wall-clock time → hungry/dirty/low-energy/sick/sulky/lonely with **visible** consequences (sprite/mood/animation changes; 赌气/离家躲起来). **Always recoverable. The pet NEVER dies, is NEVER permanently lost.** No guilt-tripping.
3. **获取 = 性格测试 → 配对 → 唯一本命宠。** A fun 6–8 question quiz (NOT clinical MBTI) → weighted nearest-archetype match → exactly **one bonded pet per user**. The match must feel **fated** ("这只就是为你而来的").
4. **美术 = AI 生成像素 sprite，人工策展。** Cute but **unusual** original critters. Each has growth stages (egg → baby → child → teen → adult) and mood variants.

---

## 3. 性格模型

Three axes (intentionally only three — keeps the quiz short and the copy bank tractable). Each maps to one thing a player *feels* from a pet:

| Axis | Low pole (−) | High pole (+) | Drives |
|---|---|---|---|
| **黏人 ↔ 独立** `attach` | 独立: self-sufficient, aloof, unbothered by a skipped day | 黏人: needy, lonely fast, melts at attention | loneliness decay rate; clingy vs. chill copy; the bonding fantasy |
| **好奇 ↔ 安稳** `curio` | 安稳: homebody, loves routine, comfort food/naps | 好奇: restless, novelty-hungry, bores fast | boredom/energy decay; what activities/foods it craves |
| **理性 ↔ 撒娇** `express` | 理性: deadpan, dry, understated | 撒娇: dramatic, big feelings, 颜文字 | **copy TONE** (the make-or-break axis for an LLM-free product) + mood-swing amplitude |

`express` is the most differentiating axis and is **weighted higher** in matching (§6).

### The 10 archetypes

| key | nameCN | axisProfile (attach / curio / express) | core need (one line) |
|---|---|---|---|
| `mochi_pudding` | 布丁团子 | +黏人 / −安稳 / +撒娇 | 稳定的陪伴与抱抱；一切照旧就最幸福 |
| `sproutling` | 豆芽崽 | +黏人 / +好奇 / ~ | 和你一起发现新鲜事；陪伴=共同探索 |
| `ember_imp` | 暴脾气小火苗 | +黏人 / +好奇 / ++撒娇(幅度最大) | 被立刻回应的实时存在感 |
| `stone_egg` | 闷墩儿 | ~ / −安稳 / −理性 | 不被打扰的安稳与可预测节奏 |
| `echo_fox` | 影狐 | −独立 / +好奇 / −理性 | 被尊重的距离感 + 智识新鲜，爱要靠你赢得 |
| `puff_seal` | 奶盖海豹 | +黏人 / ~ / +撒娇 | 持续的温柔接触与被需要感 |
| `wisp_moth` | 夜灯蛾 | −独立偏中 / +好奇 / ~ (夜行) | 在"它的时间"(夜晚)被看见 |
| `clay_golem` | 陶土憨憨 | +黏人 / −安稳 / −理性偏憨 | 被托付的责任感与稳定羁绊 |
| `spark_sprite` | 电跳豆 | ~ / +好奇 / ++撒娇(活泼) | 释放过剩精力的"玩的舞台" |
| `dream_jelly` | 梦泡水母 | −独立偏中 / −安稳 / ~ (感性·梦幻) | 被理解的内心 + 不被催促的留白 |

No "bad" archetype — every pole is sold as a love language (独立/理性 pets = "最省心""高冷却偏偏对你好").

---

## 4. 图鉴 / Bestiary

Compact roster. **Full art specs (appearance, 5 growth-stage looks, palettes, mood looks, signature behaviors) live in `docs/BESTIARY.md`.** No two share a silhouette or color family.

| nameCN | archetype | concept (1 line) | catchphrase | signature mechanic-made-visible |
|---|---|---|---|---|
| 抖抖布丁 | `mochi_pudding` | 会呼吸的焦糖布丁，半透明身体裹一颗变色心丁 | 别走嘛——再抱亿下下下(>﹏<) | deflates when set down / plumps when held = loneliness-decays-fastest |
| 探探芽 | `sproutling` | 顶嫩叶的探头豆芽，叶尖是好奇雷达 | 诶诶诶！一起去看看嘛！ | head-leaf glows at new things / wilts at repeat food = boredom-fast |
| 炸毛团 | `ember_imp` | 一点就炸、一哄就笑的小火球，火焰即情绪计 | 哼！我才不…诶你别走啊抱抱抱！ | flame IS the mood meter (red spikes ↔ blue-pink) = biggest mood swings |
| 闷石墩 | `stone_egg` | 长苔藓眉毛的鹅卵石精，慢吞吞冷面金句 | ……嗯。 | near-static idle, 3s blink = slowest-decay, most forgiving |
| 墨影狐 | `echo_fox` | 夜墨皮毛、尾坠谜题珠的清冷小狐 | （瞥你一眼）……算你识相。 | puzzle-orb tail + aloof tail-flick = solved-by-cleverness-not-cuddles |
| 奶昔豹 | `puff_seal` | 软如奶盖的奶油海豹，见你就拱过来求摸 | 啊呜~ 摸摸我嘛~ | melts into a puddle when petted, only 哼唧, never hides = easy-soothe |
| 提灯蛾 | `wisp_moth` | 举小灯笼的发光蛾，白天蔫夜晚亮 | （白天）唔…困… /（夜）醒啦！跟我来~ | TWO sprite forms (dim day / glow night) = the time-of-day gimmick |
| 陶墩墩 | `clay_golem` | 笨手笨脚的小陶人，胸口窑火当心脏 | 嗯！我守着，你放心。 | carves a tally per consecutive login + "saves the best for you" = loyalty |
| 噼啪豆 | `spark_sprite` | 停不下来的电气小豆，自嗨还拉你下水 | 冲冲冲！跟不上算你输！⚡ | no outlet → comedic destructive self-play (NOT sulking) = energy-fast |
| 梦漂漂 | `dream_jelly` | 半透明慢飘的水母，伞盖浮一片变幻星云 | （飘过来）……今天的云，像不像会化的糖。 | nebula shifts color with weather/time; loud activities LOWER mood |

Each adult stage carries a **「本命」徽** to pay off the one-pet bond.

---

## 5. 核心系统

Server-authoritative, **compute-on-read**, fully offline-deterministic. All time is **server UTC**; the client clock is never trusted. `Δh` = real elapsed hours since `last_tick`.

### 5.1 Stat model — 7 dials

Five **live stats** decay; **bond** dips only by a tiny floored amount; **exp** never decays.

| Stat | Range | Start (egg) | Decay/real hr (base) | Primary raisers |
|---|---|---|---|---|
| 饱食 `satiety` | 0–100 | 70 | −4.0/h | 喂食 +25 (snack +12) |
| 心情 `mood` | 0–100 | 60 | −2.5/h | 玩耍 +18, 抚摸 +10, feed-when-hungry +8 |
| 清洁 `cleanliness` | 0–100 | 80 | −3.0/h | 洗澡 +40→clamp |
| 精力 `energy` | 0–100 | 80 | −3.5/h awake, **+9/h asleep** | 哄睡 / night regen |
| 健康 `health` | 0–100 | **80** *(see fix)* | 0 baseline (derived) | 看医生 +40; sustained good care +1/h |
| 亲密度 `bond` | 0–1000 | 0 | −0.05/h (floored at `stage_min_bond`) | every care action +1..+5, 签到 +8, streaks |
| 经验 `exp` | 0..∞ | 0 | never | care +5..+15, 签到 +20, milestones |

> **FIX — health start contradiction.** Egg stat-cap is 80, so **health starts at 80** (not 90; 90 would be instantly clamped on first read). All five live stats start at-or-below the egg cap (satiety 70, mood 60, cleanliness 80, energy 80, health 80). `cap_for_stage` applies **only to the five live stats**; `bond` caps at 1000, `exp` is uncapped — these are never passed through `cap_for_stage`.

### 5.2 Decay formula + modifier stacking (made explicit)

For a live stat `S` with base rate `r`:
```
S' = clamp(S − r_eff · Δh, 0, cap_for_stage(stat))
```
**FIX — the four decay modifiers compose MULTIPLICATIVELY, in this fixed order, and only the ones listed per-stat apply:**
```
r_eff = r · M_stage · M_sleep · M_sick · M_bond
```
| Modifier | Value | Applies to |
|---|---|---|
| `M_stage` | egg/baby ×1.15, child ×1.0, teen/adult ×0.9 | all live stats |
| `M_sleep` | satiety ×0.5, mood ×0.25, cleanliness ×0.5 (only while `asleep`) | satiety, mood, cleanliness |
| `M_sick` | satiety ×1.4, cleanliness ×1.2 (only while SICK) | satiety, cleanliness |
| `M_bond` | `(1 − 0.30·bond/1000)` | **mood and satiety only** |

- **`M_bond` DOES apply while asleep** (a trusting pet is patient day and night) — both factors multiply.
- Worked example (sick + asleep + maxed-bond baby, satiety): `4.0 · 1.15 · 0.5 · 1.4 · 0.7 = 2.25/h`. Sleep dominates the slowdown; sickness pushes back up; all intended, none inverted.

**Energy** is the exception (regenerates while asleep), and is governed by the **unified sleep rule below** — `M_sick`/`M_bond` do not touch energy.

### 5.3 Sleep rule (de-circularized)

**FIX — single unambiguous definition.** A pet is `asleep == true` in exactly two cases:
1. **Active sleep:** the user taps 哄睡 → `asleep=true`, `sleep_since=now`. Wakes at the next 07:00 user-local boundary, or when any active verb is used. Energy regen **+9/h**.
2. **Passive night nap (auto):** if it is **not** actively asleep, energy < 25, AND the current time is inside the user-local window **[23:00, 07:00)**, the recompute integrator treats those night segments as `asleep` for **energy regen only** (+9/h), at a reduced **+5/h** (a nap is less restful than being tucked in). `satiety/mood/cleanliness` use their **awake** rates during a passive nap (no `M_sleep` discount — only an explicit 哄睡 earns the full sleep discount).

So: energy **does** passively recover overnight even without 哄睡 (resolves the §4-vs-§2 contradiction); 哄睡 is strictly better (full +9/h + the `M_sleep` discount on other stats + EXP/bond).

**Integration:** split `Δh` at each crossed 23:00/07:00 boundary (≤ `ceil(Δh/12)+1` segments) and apply the awake/active-asleep/passive-nap rate per segment.

### 5.4 Health — the derived stat

No flat decay; moves only from the condition of other stats over `Δh`:
```
neglect  = 1.5·[satiety<20] + 1.5·[cleanliness<20] + 1.0·[energy<15] + 0.5·[mood<15]   (per hour)
recovery = 1.0  if (satiety≥60 AND cleanliness≥60 AND energy≥50 AND not SICK) else 0   (per hour)
health'  = clamp(health − neglect·Δh + recovery·Δh, 0, cap_for_stage(health))
```
- crosses **below 30** → set `SICK`. Clears at **health ≥ 60** (hysteresis prevents flicker).

### 5.5 Compute-on-read tick (source of truth)

On **every read** (open app, refresh, any action):
```
recompute(pet, now_utc):
    Δh = clamp((now − last_tick).hours, 0, 720)   # 720h = 30-day worst-case floor; clock-skew safe
    apply_decay(pet, Δh)                           # §5.2/5.3 piecewise over sleep windows
    apply_health_cross_effects(pet, Δh)            # §5.4
    apply_neglect_floors(pet)                      # live stats floored at 5, health at 15 (no bleak zero)
    resolve_state_flags(pet)                       # §5.6
    last_tick = now; persist(pet)
```
Deterministic, stateless between reads, cheap. The optional nightly cron (§10) is **not** the source of truth — the game is fully correct if it never runs.

### 5.6 Soft-fail & recovery (never death, never loss)

Recovery actions (喂食/洗澡/看医生/抚摸/哄睡) are **always available** regardless of mood.

| State flag | Trigger | Recovery (always works) |
|---|---|---|
| `饿` (badge) | satiety < 30 | 喂食 +25 |
| `脏` (badge) | cleanliness < 30 | 洗澡 +40 |
| `困` (badge) | energy < 25 | 哄睡 / auto night nap |
| `SICK` (1) | health < 30 | 看医生 +40 (clears ≥60), or good care +1/h |
| `SULKING` (2) | mood < 25 for > 2h | 抚摸 + 喂食 lift mood; minutes of attention |
| `HIDING` (4) | mood < 12 **and** no interaction > 36h | a few 抚摸 + one feed coaxes out this session |
| `LONELY` (8) | no interaction > 48h (stat-independent) | any interaction resets it; +6 mood reunion bonus |

**Dominant-state precedence** (drives the main sprite/copy; others show as small badges):
`SICK > HIDING > SULKING > 困 > 饿 > 脏 > LONELY > 正常`.

**Worst case ("ignored 2 weeks"):** `Δh` capped at 720h → live stats floored at **5**, health floored at **15** (SICK but not near-zero), state = HIDING+SICK+LONELY, **bond decayed ≤ −0.84 and never below `stage_min_bond` — the relationship survives.** Reunion is ~5 taps and is designed as a touching reunion, not a punishment. See §5.8 for the guaranteed broke-and-sick path.

### 5.7 Growth / life stages

Gated on **EXP AND real days AND bond** — you cannot rush stages by grinding in one sitting.

| Stage | EXP req (cum.) | Min real days | Live-stat cap | bond gate | Unlocks |
|---|---|---|---|---|---|
| 🥚 egg | 0 | 0 | 80 | 0 | 抚摸(暖蛋), 看护, 签到 |
| 🐣 baby | 120 | 1 | 85 | 0 | + 喂食, 洗澡, basic 心声 |
| 🐥 child | 400 | 5 | 90 | 60 | + 玩耍, 哄睡, mood copy expands |
| 🦊 teen | 1000 | 12 | 95 | 180 | + 看医生 self-request, 小情绪(sulk/hide), nicknames |
| 🌟 adult | 2200 | 21 | 100 | 400 | full copy bank, all moods, 本命 badge, seasonal |

`stage_min_bond` = the bond gate of the stage reached (bond can't decay below it). Promotion check runs after stats settle each recompute. **EXP sources:** 喂食 +10 · 洗澡 +8 · 玩耍 +12 · 哄睡(full night) +15 · 看医生 +8 · 抚摸 +2 (cap 20/day) · 签到 +20 · 7/30-day streak +50/+150.

### 5.8 Daily loop, economy & actions

**The 60-second ritual:** Open → 每日签到 (1 tap: bond +8, EXP +20, roll gift, advance streak) → today's 每日心声 (the screenshot line) → Feed/Clean/Play → 抚摸/哄睡 closer. ~6 taps.

**Verbs** (server-validated; each returns the authoritative snapshot):

| Verb | Effect | Cost | Cooldown | Daily cap | EXP | Bond | Notes |
|---|---|---|---|---|---|---|---|
| 喂食 | satiety +25 | 1 kibble | 90 min | 6 | +10 | +3 | overfeed(>80)→+8, mood −2 |
| 喂零食 | satiety +12, mood +5 | 1 snack | 30 min | 4 | +4 | +2 | refused while SICK |
| 洗澡 | cleanliness +40→clamp | 1 soap | 4 h | — | +8 | +3 | |
| 玩耍 | mood +18, energy −8, clean −5 | free | 20 min | — | +12 | +4 | declined while SULKING/SICK |
| 抚摸 | mood +10, bond +1 | free | 5 min | 20 | +2 | +1 | always available |
| 哄睡 | enter sleep mode | free | 1/night | 1 | +15 | +5 | best at night |
| 看医生 | health +40, clears SICK ≥60 | 5 hearts | 6 h | — | +8 | +2 | |
| 每日签到 | bond +8, EXP +20, roll gift | free | 1/day | 1 | +20 | +8 | ritual anchor |

**Economy (minimal, no IAP in V1):** items `kibble / snack / soap`; single soft currency `heart` (爱心). Sources: 签到 gift (`3× kibble | 1 snack | 1 soap | 5 hearts`, streak-weighted), milestones. Start kit: **5 kibble, 2 snack, 2 soap, 20 hearts**. Currency only ever *eases* care — never gates recovery (抚摸/玩耍/哄睡 are free).

> **FIX — guaranteed broke-and-sick recovery (the "never punishing" hole).** On any open after an absence ≥ 48h, the server grants a one-time **「重逢关怀包」** = `{ 2 kibble, 1 soap, 5 hearts }` (exactly covers one 看医生 + one feed + one wash), idempotent per reunion. **Rate-limited: at most once per 7 days per user** and strictly **less total value than a normal week of 签到 gifts**, so neglect is never a winning strategy (closes the reunion-farming abuse vector). A returning SICK player with 0 hearts/empty larder therefore always has a frictionless ~5-tap recovery.

**Anti-abuse:** server timestamps only; `Δh∈[0,720]`; per-action cooldowns + daily caps server-enforced; diminishing returns (overfeed) + clamp prevent spam-to-max. **All action handlers run in one DB transaction with `SELECT … FOR UPDATE` on `pet_state`+`pet_cooldown`** (closes the cooldown-bypass and counter-reset races — see §13). Daily counters reset when `daily_reset_on != user_local_today`.

> **FIX — 04:00 reset.** The "04:00 boundary" is replaced by a clean **user-local midnight rollover** keyed off `daily_reset_on DATE` (the schema column can't carry a time-of-day, and a plain date rollover is simpler and abuse-equivalent). `streak`/`签到`/counters all roll at user-local 00:00. The user-local date is computed from a **server-validated** tz (§13), never a client-sent offset.

---

## 6. 性格测试

**7 questions: 6 scored + 1 pure-flavor wildcard (Q7).** Each scenario reads as a life moment and never reveals what it measures. Every scored option carries signed integer weights on `{attach, curio, express}`. Summing Q1–Q6 → vector `V = (attach, curio, express)`, each axis ≈ `[−8, +8]`.

**Matching:** 10 archetypes are fixed anchor points in the same 3D space. Pick the **smallest express-weighted squared distance**:
```
WEIGHTS = { attach: 1.0, curio: 1.0, express: 1.3 }   # express most determines the "feel"
best = argmin over anchors of  Wa·da² + Wc·dc² + We·de²
```

> **FIX — distribution skew (highest-priority correctness fix).** The original anchors/weights made `puff_seal` win ~25% and `echo_fox`/`spark_sprite`/`ember_imp` ~3% (8× imbalance — the "not biased" claim was false; the answer-space centroid sat on `puff_seal`). **Required remediation, validated by brute-force enumeration of all answer combinations before ship:**
> 1. **De-bias the option weights** so the net baseline per option is ≈0 on every axis (the original had +0.21 attach, +0.17 express drift pulling everyone toward the clingy-expressive corner). Re-center Q1–Q6 weights so `Σ` across each question's options ≈ `{0,0,0}`.
> 2. **Pull the three "mid" anchors (`puff_seal`, `sproutling`, `dream_jelly`) away from the origin** so they stop acting as centroid vacuums.
> 3. **Add answer options that reach the negative-attach and high-express corners** so the marketing-iconic corner creatures (`echo_fox`, `ember_imp`, `spark_sprite`) are reachable.
> 4. **Acceptance gate (CI test):** enumerate all answer combinations; **no archetype < ~6% or > ~16%.** Ship blocked until green.
>
> Tuned anchor set (post-rebalance starting point; the enumeration test is the real arbiter):

| key | attach | curio | express |
|---|---:|---:|---:|
| mochi_pudding | +6 | −5 | +6 |
| sproutling | +4 | +6 | +1 |
| ember_imp | +6 | +3 | +8 |
| stone_egg | 0 | −6 | −6 |
| echo_fox | −6 | +6 | −5 |
| puff_seal | +6 | 0 | +4 |
| wisp_moth | −3 | +6 | +1 |
| clay_golem | +4 | −5 | −3 |
| spark_sprite | 0 | +6 | +7 |
| dream_jelly | −4 | −4 | +1 |

> **FIX — 安稳/理性 cluster collision.** `stone_egg` (express −6) and `clay_golem` (express −3) sit only 3 apart on the axis we claim is most differentiating, so they'd frequently collide. They are now separated primarily on **`curio` and `attach`** (stone_egg `attach 0 / curio −6`, clay_golem `attach +4 / curio −5`) — the enumeration test confirms they resolve cleanly without leaning on tiebreaks.

**Tiebreak chain (deterministic, ties feel bad because they reveal the machinery):**
1. If `dist²[1] − dist²[0] > EPS (2.0)` → return winner.
2. Else → **loudest axis wins** (`argmax(|attach|·1.0, |curio|·1.0, |express|·1.3)`); among tied anchors pick the one closest on that single axis ("the quiz noticed the real you").
3. Still tied → **Q7 wildcard** maps to specific archetypes (the lamp you just chose breaks the tie — feels like a choice, not a coin-flip).
4. Final fallback → `hash(userId) mod n_tied` (stable across re-takes; never random-feeling).

**Reveal (recognition, not calculation — never show scores/axes/percentages):**
- Egg-hatch sequence delays the sprite a beat so the **name + first 心声 land first** (bond to the personality before seeing the creature).
- Screenshot-friendly 人格卡 per archetype.

> **FIX — "quote-back" reliability (the "it's literally me" jolt).** The original mirror tables keyed to ~3 specific answers per archetype → **missed for most users** (a user can reach an archetype via many answer vectors). The reveal "quote-back" is rebuilt to **always land**:
> - Mirror lines are keyed to **the axis the user answered most extremely on**, not to specific question IDs. Each archetype stores a **per-axis mirror line for each pole** (6 lines: ±attach, ±curio, ±express), e.g. mochi's `+attach` mirror: *"你说最怕一个人——它也是，从今天起你们俩谁都不用怕了。"*
> - Selection: take the user's **top-1 (and top-2) loudest axes**, fill the matching pole's mirror line. Because every user has a loudest axis, **a real quote-back always fires** — no generic fallback gutting the moment. The original per-answer mirror table is kept as an optional flavor layer when a high-amplitude answer happens to have a hand-written line.

On submit, in one transaction: insert `quiz_result`, `pet` (egg, `created_at=now`), `pet_state` (egg defaults, caps 80), `pet_cooldown`, `pet_inventory` start kit, first `voice_log` reveal line. **One pet per user**: existing pet → `409 already_bonded`. The `bias` (initial personality offset from `V`) is **clamped into the anchor's neighborhood (radius 2)** so individual flavor survives but the voice can't break.

---

## 7. 灵气 / 文案系统 (the heart)

There is no LLM. The soul is bought with (a) a **segmented copy bank authored archetype-first** (a writer writes each creature as a *whole character*, never name-swap), and (b) a **selection layer** that rotates lines across context.

### 7.1 Architecture

Every line is a **data row**: `{ id, event, voice(archetypeKey), requires{stage?,mood_band?,state_flag?,time_band?,weather?,streak_tier?,recent_action?,days_known?}, text, slots?, weight, tags }`.

**Selection** (`select_copy`, pure):
```
pool = bank[event][voice]                    # archetype-segmented first
pool = filter by requires matching ctx
if empty → fallback_chain (relax weather→time→recent_action→streak → mood_band → idle.mutter → voice.default)
pool = drop recently-used (per-(event,pet) ring buffer, N = clamp(round(0.6·|pool|),3,12))
line = weighted_random(pool, seed=hash(pet.id,event,day,salt))   # stable within a day, varies across days/pets
fill_slots(line, ctx)                         # archetype-scoped slot pools → 1 row = 10–30 surface forms
```
Slots (kaomoji/food/activity/self-action pools, **archetype-scoped**) are the cheapest multiplier: one templated row × slot combos = dozens of surfaces, all human-vetted in aggregate (constrained pools, never free generation).

**Event taxonomy** (36 events): greetings (`greet.open/return/return.long/morning/latenight`), care reactions (`feed.love/neutral/dislike/overfed/sick_refuse`, `clean/play/play.declined/pet/sleep.tuck/sleep.wake/medicine/checkin`), state/mood (`state.hungry/dirty/sleepy/sick/sulky/hiding/lonely`, `mood.elated`), flavor (`idle.mutter`, `beg.want`, `weather.react`, `growth.promote`, `streak.milestone`, `bond.confession`, `diary.daily`), meta (`reunion.gift`, `name.given`, `easter.seasonal`).

### 7.2 The mood/state/sprite/animation reconciliation (single source of truth)

> **FIX — the three vocabularies (mood_band ×5 / state_flags ×7 / sprite files ×N / animation cues) were designed independently and never mapped.** This table is now **canonical** — every layer references it:

| dominant_state (computed) | source | sprite file (V1 authored/derived) | one-shot animation cue |
|---|---|---|---|
| 正常 + mood_band 极好/好 | mood | `<stage>_happy` (derived) | `idle` / `react_happy` |
| 正常 + mood_band 平 | mood | `<stage>_idle` (authored) | `idle` |
| 正常 + mood_band 低/极低 | mood | `<stage>_sad` (derived) | `idle_low` |
| `困` / asleep | state | `<stage>_sleeping` (derived) | `sleep` |
| `SICK` | state | `<stage>_sad` + sick-tint (derived) | `sick` |
| `SULKING` | state | `<stage>_sulk` (**authored pose, shipped creatures only**) | `sulk` |
| `HIDING` | state | `<stage>_hide` (**authored pose, shipped creatures only**) | `hide` |
| `LONELY` | state | `<stage>_idle` + by-the-door FX overlay | `lonely` |
| reunion beat | event | `<stage>_happy` + heart FX overlay | `reunion` |
| feed (V1, eating deferred) | event | `<stage>_happy` + food-prop FX | `eat_happy` |
| feed dislike | event | `<stage>_sad` + sweat-drop FX | `refuse_pout` |

**Consequence for art (resolved, not hand-waved):** `refuse_pout`, `lonely`, `reunion`, `eat_happy` are all **FX-overlay + transform on an existing sprite** (no new pose). The only states needing a **truly authored extra pose** are `sulk` and `hide` — and these are budgeted **only for the V1-shipped creatures** (§9, §12). For unshipped creatures `sulk`/`hide` fall back through the chain to `<stage>_sad`. The `/api/action.animation` string vocabulary is now **closed over sprites/overlays that exist**.

`mood_band` buckets: `极好` (mood≥90), `好` (70–89), `平` (40–69), `低` (15–39), `极低` (<15). `state_flag` overrides `mood_band` when a dominant negative state is active (precedence per §5.6).

### 7.3 每日心声 / 日记 (emotional centerpiece, dedicated 10-day anti-repeat ring)

A once-per-user-local-day line the pet "writes," surfaced at 签到. Built as a 3-part templated sentence from archetype-scoped pools + an optional **memory clause**:
```
DIARY = [OPENER (time/weather/streak)] + [BODY (archetype thought, 1–2 slots)] + [optional MEMORY CLAUSE] + [SIGNOFF + kaomoji]
```
Each part has its own anti-repeat ring → combinatorial freshness. With ~6 openers × ~8 bodies × ~5 memory × ~5 signoffs per archetype = ~1,200 base permutations × slots → tens of thousands of surfaces.

> **FIX — aliveness past week 2 (the central bet's biggest weakness).** Five last-24h memory flags exhaust in ~2 weeks ("it has 5 canned reactions"). The diary now adds **relationship-ACCUMULATING memory clauses** that reference history, not just yesterday:
> - **streak-length-aware:** "我们已经第 {streak} 天没分开啦" (tiered: 7/30/60/100).
> - **bond-tier-aware:** unlocks new confession fragments at bond 250/500/800.
> - **total-days-known-aware:** "认识你第 {days} 天了，我记得第一天你来的样子。"
> - **behavioral-pattern-aware** (cheap aggregates over `action_log`): "你总是很晚才喂我" (median feed hour late), "你今天又把我喂撑了" (overfeed≥4), "最近你天天都来" (7/7 active days).
> These compound, so the "it remembers *us*" effect grows instead of decaying. This is the **cheapest insurance for the entire aliveness bet** and is a **hard V1 deliverable**, not an estimate.

### 7.4 Context-input sourcing (don't lean on unsourced inputs)

> **FIX — weather + timezone were first-class copy inputs with no source.** Decision: **CUT weather from V1 entirely** (no weather predicates; copy works on time/mood/streak/recent_action/days_known/bond). The freed copy budget is **reinvested into `recent_action`, `streak_tier`, `bond_tier` and the accumulating memory clauses above.** `weather.react` and weather-tagged lines are deferred to V2 (which will also spec a weather provider + location-permission UX + cache table). **Timezone** is captured and **server-validated** at login (§13) so `time_band` (清晨/白天/傍晚/深夜) and the sleep/reset windows are reliable; `wisp_moth`'s day/night gimmick depends on this and is therefore **deferred to V2** (it is not in the V1 shipped roster — §12).

### 7.5 Scale estimate & authoring plan (realistic)

Per-archetype authored target ≈ **~150 line-rows + ~50 slot fragments ≈ 200 units**; × 10 = **~2,000 authored units**, yielding a *felt* bank of **~15k–40k distinct surfaces** after slots+context.

> **FIX — schedule realism (the single biggest risk, honestly costed).** The original "~2–3 days/archetype, one writer, ~3 weeks total" implies ~75 publishable lines/day — unrealistic for voice-locked, screenshot-worthy, 30-day-repeat-audited copy (realistic ~20–30 keepers/day). **True cost ≈ 6–8 weeks of dedicated senior bilingual copywriting for all 10.** Mitigation is the V1 cut line (§12): **author 3 creatures to gold first** (~2.5–3 weeks), validate aliveness on real users, then pay the rest of the bill.

**Plan:** Phase 0 tooling (lock schema + Google-Sheet/CSV authoring + a 5-line preview renderer). Phase 1 write `mochi_pudding`, `echo_fox`, `ember_imp` to "gold" (the style bible). Phase 2 harvest a shared template skeleton + slot starter-kit (cuts per-archetype time ~40%). Phase 3 fill the rest neighbor-batched by axis cluster. Phase 4 automated coverage QA (every `event×archetype` cell ≥ min rows; no empty pools without a defined fallback) + 30-day repeat-feel simulation + screenshot-polish the ~5 highest-visibility events. Phase 5 live tuning (data, not redeploy).

---

## 8. 技术架构

Mirrors `quit-diary` one-for-one. Project key `cloudpet`, port `3012`, basePath `/cloudpet`. **No runtime LLM** → the runtime is three pure functions (`recompute`, `apply_action`, `resolve_state_flags`) + a copy selector.

### 8.1 Repo layout
```
/home/liharr/src/cloudpet/
├── db/{bootstrap.sh, schema.sql}              # bootstrap as `umami` superuser; idempotent schema
├── docker-compose.yml                          # 127.0.0.1:3012:3000, network traffic-monitor_default
├── docs/{BESTIARY.md, COPYBANK_AUTHORING.md, SETUP.md}
├── scripts/nightly-tick.js                     # cron: reminders + heartbeat + cosmetic pre-warm
├── miniprogram/                                # native WeChat, TS; no Taro/uni-app
│   ├── app.{json,ts,wxss}                       # pages + 4-tab tabBar
│   ├── assets/sprites/<archetypeKey>/...        # per-creature indexed-palette sheets (§9)
│   ├── pages/{quiz,hatch,home,diary,codex,me}/  # *.{json,ts,wxml,wxss}
│   └── utils/{api.ts, auth.ts, format.ts}        # api: wx.request + X-User-Id header
└── web/                                          # Next.js 14 App Router, standalone, basePath /cloudpet
    ├── next.config.js  Dockerfile  package.json   # next 14.2.18, react 18.3.1, pg 8.13.x
    └── src/
        ├── app/{layout.tsx, page.tsx, api/...}    # Umami in layout; landing in page
        ├── lib/{db,auth,wechat,types,tick,actions,stages,quiz,copy}.ts
        └── data/                                   # the heart — pure data, no code branches on it
            ├── bestiary.ts  quiz-questions.ts  stage-table.ts
            └── copybank/{index.ts, mochi_pudding.ts, ... ×10}.ts
```

### 8.2 Postgres schema (`db/schema.sql`)
Idempotent. One bonded pet per user (`UNIQUE(user_id)`). `(pet_state.snapshot, last_tick)` is the whole authoritative state. Bootstrap connects as the **`umami`** superuser (not `postgres`).
```sql
CREATE TABLE IF NOT EXISTS app_user (
  user_id           TEXT PRIMARY KEY,                       -- openid, or anon-<uuid>
  is_anonymous      BOOLEAN NOT NULL DEFAULT FALSE,
  tz_offset_minutes INTEGER NOT NULL DEFAULT 480,           -- SERVER-VALIDATED at login (§13)
  sub_opt_in        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_result (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  attach        INTEGER NOT NULL,                            -- ~[-8,8]
  curio         INTEGER NOT NULL,
  express       INTEGER NOT NULL,
  archetype_key TEXT NOT NULL,
  answers       JSONB NOT NULL,                              -- raw answer ids, for reveal quote-back
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quiz_user ON quiz_result (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pet (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  archetype_key TEXT NOT NULL,
  species_id    TEXT NOT NULL,                               -- == archetype_key in V1
  name          TEXT NOT NULL,
  stage         TEXT NOT NULL DEFAULT 'egg'
                CHECK (stage IN ('egg','baby','child','teen','adult')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),          -- "real days elapsed" gate
  UNIQUE (user_id)                                            -- exactly ONE bonded pet (V1)
);
CREATE INDEX IF NOT EXISTS idx_pet_user ON pet (user_id);

CREATE TABLE IF NOT EXISTS pet_state (
  pet_id      BIGINT PRIMARY KEY REFERENCES pet(id) ON DELETE CASCADE,
  satiety     INTEGER NOT NULL DEFAULT 70 CHECK (satiety     BETWEEN 0 AND 100),
  mood        INTEGER NOT NULL DEFAULT 60 CHECK (mood        BETWEEN 0 AND 100),
  cleanliness INTEGER NOT NULL DEFAULT 80 CHECK (cleanliness BETWEEN 0 AND 100),
  energy      INTEGER NOT NULL DEFAULT 80 CHECK (energy      BETWEEN 0 AND 100),
  health      INTEGER NOT NULL DEFAULT 80 CHECK (health      BETWEEN 0 AND 100),  -- 80 == egg cap (FIX)
  bond        INTEGER NOT NULL DEFAULT 0  CHECK (bond BETWEEN 0 AND 1000),
  exp         BIGINT  NOT NULL DEFAULT 0  CHECK (exp >= 0),
  last_tick   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  state_flags INTEGER NOT NULL DEFAULT 0,                    -- SICK=1 SULKING=2 HIDING=4 LONELY=8
  state_since TIMESTAMPTZ,
  asleep      BOOLEAN NOT NULL DEFAULT FALSE,
  sleep_since TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pet_cooldown (
  pet_id           BIGINT PRIMARY KEY REFERENCES pet(id) ON DELETE CASCADE,
  last_feed TIMESTAMPTZ, last_snack TIMESTAMPTZ, last_clean TIMESTAMPTZ,
  last_play TIMESTAMPTZ, last_pet TIMESTAMPTZ, last_sleep TIMESTAMPTZ,
  last_doctor TIMESTAMPTZ, last_checkin TIMESTAMPTZ, last_reunion_gift TIMESTAMPTZ,  -- reunion rate-limit (FIX)
  feed_count_day  INTEGER NOT NULL DEFAULT 0,
  snack_count_day INTEGER NOT NULL DEFAULT 0,
  pet_count_day   INTEGER NOT NULL DEFAULT 0,
  daily_reset_on  DATE,                                       -- user-local date the *_day counters belong to
  streak_days     INTEGER NOT NULL DEFAULT 0,
  streak_state    TEXT NOT NULL DEFAULT 'active'              -- active|grace (FIX: explicit state machine)
                  CHECK (streak_state IN ('active','grace')),
  last_active_date DATE
);

CREATE TABLE IF NOT EXISTS pet_inventory (
  pet_id   BIGINT NOT NULL REFERENCES pet(id) ON DELETE CASCADE,
  item_key TEXT   NOT NULL CHECK (item_key IN ('kibble','snack','soap','heart')),
  qty      INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  PRIMARY KEY (pet_id, item_key)
);

CREATE TABLE IF NOT EXISTS action_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pet_id      BIGINT NOT NULL REFERENCES pet(id) ON DELETE CASCADE,
  user_id     TEXT   NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  verb        TEXT   NOT NULL,                                -- feed|snack|clean|play|pet|sleep|doctor|checkin
  local_date  DATE   NOT NULL,
  line        TEXT, line_intent TEXT,
  delta       JSONB,                                          -- {satiety:+25, mood:+8, exp:+10, bond:+3}
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_action_pet_time ON action_log (pet_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkin_per_day
  ON action_log (pet_id, local_date) WHERE verb = 'checkin';   -- 签到 idempotent at DB layer

CREATE TABLE IF NOT EXISTS voice_log (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pet_id     BIGINT NOT NULL REFERENCES pet(id) ON DELETE CASCADE,
  local_date DATE   NOT NULL,
  line       TEXT   NOT NULL,
  line_id    TEXT   NOT NULL,                                 -- for anti-repeat ring
  context    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_per_day ON voice_log (pet_id, local_date);
CREATE INDEX IF NOT EXISTS idx_voice_pet_time ON voice_log (pet_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sub_grant (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     TEXT   NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  template_id TEXT   NOT NULL,
  consumed    BOOLEAN NOT NULL DEFAULT FALSE,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sub_unconsumed ON sub_grant (user_id) WHERE consumed = FALSE;
```

> **FIX — streak grace state machine.** Replaced the single `streak_grace BOOLEAN` with `streak_state ('active'|'grace')` + the existing `last_active_date`. Rule (3-state, fully reconstructable): a successful care day on a new `local_date` → `streak_days++`, `streak_state='active'`. First missed day (today − `last_active_date` = 2 days) → `streak_state='grace'`, `streak_days` frozen. Second consecutive miss (gap ≥ 3 days) → `streak_days = floor(streak_days/2)`, `streak_state='active'` (reset complete). Any successful day from `grace` → back to `active`, increment. Never zeroes.

> **FIX — daily-gift idempotency.** The gift is **deterministically derived** from `hash(pet_id, local_date)` (not live `random()`), so the unique-per-day checkin row makes the roll **replay-safe**: a retried 200 yields the identical gift, and the inventory credit is applied inside the same `FOR UPDATE` transaction as the `action_log` insert — credited exactly once.

### 8.3 API routes (`web/src/app/api/...`)
All: `dynamic="force-dynamic"`, `runtime="nodejs"`, `getUserId(req)` from `X-User-Id` (except `/api/login`). Every authenticated read/write calls `recompute(pet, now)` first.

| Route | Method | recompute | Purpose |
|---|---|---|---|
| `/api/login` | POST | n/a | wx.login code → openid → stable `user_id` (anon-`<uuid>` fallback); **captures+validates tz** (§13) |
| `/api/quiz` | POST | n/a (creates) | score → match → create bonded pet+egg; `409 already_bonded` if exists |
| `/api/pet` | GET | **yes** | ticked state + today's 心声 (lazily created) + per-verb availability + inventory + streak; `404 no_pet` |
| `/api/action` | POST | **yes** | one verb: `FOR UPDATE` → cooldown/state/inventory gate → clamped delta → new state + reaction line + animation cue + gift |
| `/api/pet/diary` | GET | light | recent 心声 + action history timeline |
| `/api/pet/rename` | POST | n/a | **(FIX)** set/rename `pet.name` (1–12 chars, validated); fires `name.given` line |
| `/api/pet/retake` | POST | n/a | **(FIX)** buried re-take; see semantics below |
| `/api/subscribe` | POST | n/a | record one 订阅消息 authorization (per-message consent) |

`/api/action` responses: `200 {ok,state,delta,line,animation,rewards?}`, `429 {ok:false,error:"cooldown",remaining_ms}`, `409 {ok:false,error:"unavailable",reason}`. Pipeline (one txn, `SELECT … FOR UPDATE`): recompute → cooldown gate → state/stage gate (play blocked SULKING/SICK; snack refused SICK; feed/clean/pet/doctor always allowed; verb must be stage-unlocked) → inventory gate → clamped delta with archetype food/decay multipliers from `bestiary.ts` → `resolve_state_flags` → `select_copy` → write `last_<verb>`, `voice_log`/`action_log` → growth check.

> **FIX — re-take & rename semantics (the UNIQUE(user_id) wall).** `default_name(archetypeKey)` returns the archetype's display name as a **placeholder** (布丁团子, 墨影狐, …) which the hatch flow immediately invites the user to personalize via `/api/pet/rename` — so names are personal, not shared. **`/api/pet/retake`** (reached only via 设置 → 关于这只宠物, behind a strong confirm: *"重新测试会让现在这只回到蛋里等待，你确定吗？"*): re-runs the quiz, then **in one transaction** updates the *existing* `pet` row's `archetype_key`/`species_id`/`name`→placeholder, **resets `stage='egg'`, `pet_state` to egg defaults, `pet_cooldown`**, and **deletes the old `voice_log`/preserves `action_log` for audit**. **Bond and exp are reset to 0** (a re-take is a genuine re-bonding, not a free transfer of progress — this also disincentivizes re-rolling). Inventory is preserved. Deterministic: same answers + same `userId` → same pet, so re-take never feels like a gacha re-roll.

### 8.4 Where copy & personality data live
**Server resolves the line; returns finished text + an animation-cue string.** The copy bank, stat rules, and bestiary configs live **only in the backend** (`web/src/data/`, versioned). The client never ships the copy pack and never branches on personality — it renders `voice.line`/`action.line` strings and maps the `animation` cue → a local PNG/FX overlay. Rationale: anti-repeat + selection need the server-side `voice_log` ring and full context; designers retune `data/copybank/*.ts` and `docker compose up -d --build` with **no mini-program re-submission**; thin client = simpler WeChat review.

### 8.5 Client pages & sprite rendering
`app.ts onLaunch → ensureUserId()` (wx.login → POST /api/login → store user_id). `home` load → GET /api/pet; `404 no_pet` → redirect to `quiz`. **4-tab tabBar** + non-tab `quiz`/`hatch`:

| Page | Role |
|---|---|
| `quiz` | 7 scenario questions → POST /api/quiz (onboarding only) |
| `hatch` | name + first 心声 first, sprite delayed a beat, then → home; **rename prompt** |
| `home` (主页) | sprite (dominant-state frame) + 5 stat bars + bond/exp + today's 心声 card + action buttons (disabled buttons show remaining cooldown) |
| `diary` (心声) | GET /api/pet/diary → 心声 + interaction timeline, screenshot cards |
| `codex` (图鉴) | 10 archetypes; bonded one unlocked as 本命, others silhouetted (cosmetic, local list) |
| `me` (我的) | streak, inventory, 订阅消息 opt-in, **buried re-take entry** |

**Sprite rendering (light, native):** per-creature **indexed-palette sprite-sheet** (`<archetypeKey>.png` + `.json` frame rects), `image-rendering: pixelated`. Idle animation = 2-frame swap on `setInterval` (~2–3fps) + a **per-archetype transform tween** (mochi jiggle, stone_egg near-static, spark_sprite jitter, wisp/dream bob, ember pop) — distinct "personalities in motion" from static frames, **zero extra art**. Mood/state FX (Zzz/sparkle/sweat/heart/by-the-door) = a **shared ~10KB FX overlay atlas** reused across all creatures. **No canvas needed in V1.**

> **FIX — empty/error states (were undefined).** `home` renders a skeleton (sprite placeholder + greyed bars) while `/api/pet` is in flight; on network failure → a gentle retry card ("和它的连接断了一下，点这里再试试") with no data loss (state is server-authoritative). If `/api/quiz` half-fails, the whole insert is one transaction → either a pet exists (route to hatch) or none does (re-show quiz); the client GETs `/api/pet` on quiz-success to confirm before navigating. If the bonded creature's assets fail to load, the fallback chain (§9.2) degrades to a placeholder blob rather than a broken image.

### 8.6 Docker / nginx / port 3012
`docker-compose.yml`: `web` builds `./web`, `env_file: .env`, `PG_USER/PG_DB=cloudpet`, `ports: "127.0.0.1:3012:3000"`, `networks.default { name: traffic-monitor_default, external: true }`. `next.config.js`: `{ basePath:"/cloudpet", output:"standalone" }`. Dockerfile copied verbatim from quit-diary. `.env` (gitignored): `PG_PASSWORD`, `WX_APP_ID`, `WX_APP_SECRET`, `NEXT_PUBLIC_UMAMI_*`. nginx + bootstrap in §10.

---

## 9. 美术管线

Full spec in `docs/BESTIARY.md`. Summary here.

### 9.1 Style guide (cohesion via constraints)
- **Canvas:** hero **128×128** authored on a **64×64 logical grid** (2px true-pixels); thumb 64×64; mood/badge glyphs 32×32 shared.
- **Outline:** selective 1-logical-px **tinted-dark** silhouette outline (never `#000`); interior lines = darker shade of adjacent fill.
- **Shading:** flat 3-tone cel (base + cool shadow + warm highlight), single **top-left** light, one eye specular pip. Dither only as texture, never gradient ramps.
- **Palette:** a locked **32-color shared world palette**; **each creature uses ≤ 4 hue families**; shared cream `#FFF7E6` accent (never pure white). This is the real cohesion lever.
- **Silhouette:** chibi (head ≈ 50–60%), rounded/blobby (no scary spikes even on fire/electric critters), must be identifiable as a pure 64px black silhouette.
- **Mood as deterministic palette transform** where possible: `happy` = base + highlight + sparkle; `sad/sick` = desaturate 25% + value −10% + sick-tint; `sleeping` = value −8% + closed-eye + Zzz.

### 9.2 Sprite matrix + V1 subset
Full ambition = 10 creatures × (egg + baby/child/teen/adult × moods). **Egg is shared-shape** (1 base egg × 10 identity tints). Authored = `idle` per stage; `happy/sad/sleeping` derived for free; `eating` deferred (food-prop trick covers the feed loop).

**V1 authored base** = `idle` only: 4 stages × shipped creatures + shared egg tints, **plus the two authored poses the soft-fail payoff needs (`sulk`, `hide`) for shipped creatures only** (per §7.2 — the original budget omitted these and contradicted "the consequence IS the content"). Derived moods regenerate from each cleaned `idle`.

**Stable naming contract + fallback chain** (so deferred/missing art degrades, never breaks):
```
assets/pets/<creatureId>/<stage>_<mood>.png   (mood ∈ idle|happy|sad|sleeping|sulk|hide; egg.png no mood)
resolution: <stage>_<mood> → <stage>_idle → <prevStage>_<mood> → _placeholder/<stage>_<mood> → _placeholder/baby_idle
```
**Placeholder strategy:** a deterministic Pillow/SVG script generates on-palette colored-blob proto-pets (size-by-stage, mood-encoded faces, real mood-remap applied) at the canonical paths → **the entire game loop runs today**; real PNGs dropped at the same paths swap in with **zero code change**.

### 9.3 Generation prompt template
A chroma-keyed pixel-art text-to-image template (slots: `{creature_appearance}`, `{stage_descriptor}`, `{mood_descriptor}`, `{palette_hex_list}`, `{accent_hex}`, `{chroma_key_hex=#FF00FF}`, `{is_floating}`) + a fixed negative prompt (no AA/gradients/3D/text/pure-black/pure-white/cat-dog-rabbit). **Post-process (deterministic):** generate hi-res → chroma-key→alpha → snap to 64-grid (nearest-neighbor, best phase) → quantize to the 32-color palette → outline cleanup → alpha-trim & recenter (feet at row 56) → export 128/64 → derive moods. **Human curation gate on `idle` only**; derived moods inherit approval.

> **Realism note (acknowledged risk):** stage-consistent silhouettes across 5 growth stages of the *same* creature is exactly what diffusion is worst at → expect heavy manual pixel cleanup per hero. 50 curated, on-model, stage-consistent heroes is **weeks of art direction**, not a build step. V1 ships **3 creatures' real art** (§12); the other 7 ride placeholders.

### 9.4 Miniprogram packaging budget
Main package ≤ 2MB. **V1 ships 3 creatures' indexed-palette sheets in the main package** (fits comfortably). The full 10-creature build uses **per-creature subpackages** lazy-loaded on hatch via `preloadRule` keyed off the quiz result (only the bonded creature downloads) — **deferred to V2** to avoid a download spinner at the emotional peak. A build step counts real-PNG coverage vs the matrix and surfaces it on /status.

---

## 10. VM 接线 (6-step checklist — cost-logging N/A)

**Pre-reqs:** scaffold backend; `db/bootstrap.sh` (as **`umami`** superuser) creates role+db `cloudpet`, applies `schema.sql`; secrets at `~/.config/cloudpet.env` (mode 600): `WX_APP_ID`, `WX_APP_SECRET`, `CLOUDPET_PG_PASSWORD`.

**1. nginx route** — `/etc/nginx/snippets/cloudpet.conf` (basePath means **no trailing path** on proxy_pass):
```nginx
location /cloudpet {
    proxy_pass http://127.0.0.1:3012;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
Add `include snippets/cloudpet.conf;` to `/etc/nginx/sites-enabled/personal-site`; `sudo nginx -t && sudo nginx -s reload`.

**2. site-index** — add an `<a class="item">` (🥚 云宠物 → `https://ai-native.japaneast.cloudapp.azure.com/cloudpet/`) to `/home/liharr/src/site-index/index.html`; commit + push to `WhatsFish/site-index`.

**3. /status group** — **written against the REAL codebase shapes** (`CheckFn` returning one `{id,group,name,status,detail}`, `query(db, sql)`, the `probe(...)` helper, `Job{id,name,schedule,warnAfterMs,failAfterMs}`):

- `status/web/src/lib/pg.ts` — extend `DbName` union with `"cloudpet"` and add a `configFor` branch reading `CLOUDPET_PG_*` (user/db default `cloudpet`).
- `status/web/src/lib/checks/http.ts` — add a probe: `probe("cloudpet-http", "cloudpet", "Landing", "/cloudpet/")`.
- **NEW** `status/web/src/lib/checks/cloudpet.ts` (mirrors `quit-diary.ts` exactly):
```ts
import { query } from "../pg";
import type { CheckFn } from "../runner";

export const cloudpetSchema: CheckFn = async () => {
  const rows = await query<{ count: string }>(
    "cloudpet",
    `SELECT COUNT(*)::text AS count
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('app_user','pet','pet_state','action_log')`,
  );
  const present = parseInt(rows[0]?.count ?? "0", 10) === 4;
  return {
    id: "cloudpet-schema",
    group: "cloudpet",
    name: "Schema",
    status: present ? "ok" : "fail",
    detail: present ? "app_user + pet + pet_state + action_log present" : "tables missing",
  };
};

// Liveness (not correctness — compute-on-read is authoritative): most-recent tick.
export const cloudpetTick: CheckFn = async () => {
  const rows = await query<{ mins: string | null }>(
    "cloudpet",
    `SELECT (extract(epoch FROM (now() - max(last_tick))) / 60)::text AS mins FROM pet_state`,
  );
  const mins = rows[0]?.mins == null ? null : parseFloat(rows[0].mins);
  const status = mins == null ? "ok" : mins >= 60 * 24 ? "warn" : "ok"; // weekend/quiet tolerant
  return {
    id: "cloudpet-tick",
    group: "cloudpet",
    name: "Pets ticked",
    status,
    detail: mins == null ? "no pets yet" : `last tick ${Math.round(mins)}m ago`,
  };
};
```
- `status/web/src/lib/checks/index.ts` — import + register `cloudpetSchema`, `cloudpetTick`.
- `status/web/src/app/page.tsx` — add `"cloudpet"` to `GROUP_ORDER`; `GROUP_LABEL["cloudpet"]="云宠物"`.
- `status/.env` — append `CLOUDPET_PG_USER=cloudpet`, `CLOUDPET_PG_PASSWORD=…`, `CLOUDPET_PG_DB=cloudpet`.
- `status/web/src/lib/checks/cron.ts` — add to `JOBS` (real shape, **weekend-tolerant**):
```ts
{ id: "cloudpet-tick", name: "云宠物 nightly tick (daily)", schedule: "daily",
  warnAfterMs: 28 * H, failAfterMs: 48 * H },
```
- Rebuild: `cd /home/liharr/src/status && docker compose up -d --build --force-recreate web`.

**4. cron heartbeat** — nightly tick (reminders + heartbeat + cosmetic pre-warm; **not** the source of truth). `&& touch` is the **last** clause:
```cron
0 12 * * *  cd /home/liharr/src/cloudpet && /usr/bin/node web/scripts/nightly-tick.js >> /home/liharr/src/cloudpet/logs/tick.log 2>&1 && touch /home/liharr/.local/share/cron-heartbeats/cloudpet-tick
```

**5. cost logging — SKIP (N/A).** Pure rule-based: no Claude/Foundry call at runtime → no `cost_event` to attribute. No `cost-log.ts`, no cost env.

**6. Umami** — `web/src/app/layout.tsx` adds the script via `next/script`, gated on `NEXT_PUBLIC_UMAMI_SRC` + `NEXT_PUBLIC_UMAMI_WEBSITE_ID`. **Operator action: create the "云宠物" website in Umami first to get the website-id**, then set the env vars.

---

## 11. WeChat 上线

1. **AppID** — register the mini program on `mp.weixin.qq.com`; put AppID + AppSecret into `~/.config/cloudpet.env` (`WX_APP_ID`/`WX_APP_SECRET`) for the `/api/login → jscode2session → openid → stable user_id` flow (anon-UUID fallback if absent).
2. **服务器域名白名单** — add `https://ai-native.japaneast.cloudapp.azure.com` to **request 合法域名** (HTTPS, covered by the VM's Let's Encrypt cert). Client `utils/api.ts` base URL = `https://ai-native.japaneast.cloudapp.azure.com/cloudpet`.
3. **Name-review caution** — a pet game is low-risk, but the 测试/抽到 mechanic must be framed as **领养/养成/测试/陪伴**, never **抽奖/抽卡/扭蛋/盲盒/赌/博彩**. Lead name `本命小宠`; review-safest fallback `像素小宠养成记`. Choose 类目 工具 / 休闲娱乐-养成 (**not** 抽奖/博彩).
4. **Ship flow** — DevTools: set AppID, confirm whitelisted HTTPS base URL → 上传 (开发版本) → 设为体验版 + add 体验成员, smoke-test on devices (login → 测试 → 孵化 → daily loop → soft-fail recovery) → 提交审核 (养成/陪伴 notes) → 发布 正式版.
5. **Pre-submit sanity** — backend reachable over the whitelisted HTTPS domain; `/api/login` returns a stable `user_id`; one-pet-per-user enforced server-side; **all recovery verbs reachable so a reviewer can confirm the pet never dies / is never lost** (matches the soft-stakes positioning).

---

## 12. 分期落地计划

**Adopt the critique's V1 cut line: ship a real, screenshottable, emotionally-complete vertical slice in ~3–4 weeks — not ten creatures in ~8–10 weeks — then validate the aliveness bet on real users before paying the full bill.**

### Phase 0 — Scaffold + DB + wiring skeleton (~3–4 days)
Repo scaffold (mirror quit-diary); `schema.sql` + `bootstrap.sh`; docker-compose on `:3012`; nginx snippet; site-index entry; /status group + cron heartbeat (skeleton check passing); login flow + anon fallback + **tz capture/validation**; deterministic placeholder-blob art generator producing all 10 creatures' proto-pets. **Gate:** `/cloudpet/` is green on /status; an anon user can log in.

### Phase 1 — V1 vertical slice (体验版) — IN scope
- **Quiz → bonded pet, end-to-end**, with the **rebalanced anchors** (enumeration acceptance test green: no archetype <6%/>16%) and the **axis-keyed quote-back** (always lands). The quiz runs across **all 10 axes/archetypes**, but **routes only among the 3 shipped creatures** in V1: a result matched to a non-shipped archetype maps to its **nearest-of-the-3** by the same weighted distance (the user still gets a fated, voice-true pet; the other 7 are placeholder-only in 图鉴 so nothing breaks).
- **3 creatures fully built end-to-end** spanning the corners: **`mochi_pudding` (clingy-cozy), `echo_fox` (aloof-dry), `ember_imp` (explosive)** — the three already gold-drafted in the copy samples. **Real pixel art** for these 3 (egg→baby→child stages + idle/happy/sad/sleeping derived + authored `sulk`/`hide`); placeholder blobs for the other 7.
- **Core loop:** compute-on-read tick (all §5 formulas, the FIXED modifier stacking + unified sleep rule) + the 6 care verbs + 玩耍 + 每日签到 + **每日心声 with accumulating memory clauses** + the 5 soft-fail states with sprite coverage.
- **Pages:** `quiz`, `hatch` (name+心声-first, rename), `home` (the 宠物主页), `diary`. Empty/error states implemented.
- **Growth:** egg → baby → child only.

**OUT of V1 (deferred to Phase 2+):** the remaining 7 creatures' real art/copy; teen/adult stages; **weather entirely** (no weather provider, no weather predicates); **`wisp_moth`'s day/night gimmick** (depends on V2 weather/tz polish); 订阅消息 push (opt-in UI dead-ended or hidden); `codex/图鉴` tab as a full feature (a stub is fine); seasonal/confession/milestone flavor events; per-creature subpackage lazy-load (3 creatures fit the main package).

**Biggest risk called out:** **copy aliveness.** Mitigation baked into Phase 1: (a) accumulating relationship memory clauses are a **hard deliverable** (not an estimate); (b) the diary part-pools are an **audited** deliverable (the 30-day repeat simulation must pass before 体验版); (c) only 3 creatures means the writer can hit gold quality in ~2.5–3 weeks; (d) validate on real 体验版 users **before** committing the remaining 6–8 weeks of copy for 7 more creatures.

### Phase 2+ — Scale out (post-validation)
- Remaining **7 creatures** real art + gold copy (neighbor-batched; ~6–8 weeks total copy across the fleet, art in parallel).
- **teen/adult** stages + per-creature subpackage lazy-load (with a hatch-screen download UX that preserves the magic).
- **Weather subsystem** (provider + location-permission UX + cache table + weather predicates) → then **`wisp_moth`'s** day/night gimmick and `dream_jelly`'s weather drift go live.
- **订阅消息** retention (the nightly cron sends ≤1 warm pet-voiced push per user per ~24–36h, consuming one `sub_grant`; platform per-message consent caps frequency).
- Full **图鉴** as a collection/discovery surface; seasonal/confession/milestone flavor events; live copy-bank tuning (data, no redeploy).

---

## 13. 风险与开放问题

**The aliveness bet (the central risk).** A well-executed version *can* feel alive for the cozy-daily-ritual audience (bar = QQ宠物/Tamagotchi nostalgia, not conversational AI) — but only if: (1) memory clauses **accumulate** (now a hard V1 deliverable, §7.3); (2) context inputs are **real** — we **cut weather** and **reinvested** the budget into recent_action/streak/bond rather than ship a design leaning on an unsourced input (§7.4); (3) the **diary part-pools are audited**, not estimated (Phase 1 gate). The aliveness is buyable; this plan now actually buys it.

**Content-authoring load (the biggest schedule risk).** Honestly recosted at **~6–8 weeks senior bilingual copy for all 10** (not ~3). De-risked by the V1 cut to **3 creatures** and validating before paying the rest.

**Art realism.** Stage-consistent diffusion sprites need heavy manual cleanup; V1 ships 3 creatures' real art, 7 on placeholders that degrade gracefully via the fallback chain.

**Abuse vectors — status:**
- *Client clock tampering* — **closed** (server `now`, `Δh∈[0,720]`, client timestamp ignored).
- *Growth-gate grinding* — **closed** (gated on real days AND bond AND exp).
- *Cooldown bypass / 04:00 counter race* — **closed by this plan** (`SELECT … FOR UPDATE` on `pet_state`+`pet_cooldown` inside the single action transaction).
- *Check-in day-boundary arbitrage via tz* — **closed by this plan** (`tz_offset_minutes` is **server-validated at login** within a sane range, never trusted from a per-request client offset; daily/local-date math uses the stored validated tz).
- *Daily-gift double-claim* — **closed** (deterministic gift from `hash(pet_id, local_date)` + unique-per-day checkin + same-txn credit → replay-safe).
- *Reunion-gift farming* — **closed** (重逢关怀包 rate-limited once/7 days, worth strictly less than normal play, `last_reunion_gift` tracked).
- *Multi-device anon farming for start kits* — **low payoff in V1** (no trading/IAP/leaderboard); add a per-IP/device account-creation cap **before** any future economy/social feature. **(Open: operator's call on whether to add the cap now.)**

**Open questions needing the operator's call:**
1. **App name** — confirm `本命小宠` as primary (vs `像素小宠养成记` for review safety).
2. **Re-take resets bond/exp to 0** (chosen to disincentivize re-rolling and protect the 本命 bond) — confirm this is the desired UX vs. carrying progress over.
3. **V1 routing of non-shipped archetypes to nearest-of-3** vs. the cleaner alternative of **collapsing the quiz to route only among the 3** in V1 (slightly less "fated" coverage, but never maps a user to a creature they didn't see). Recommend nearest-of-3; flag for sign-off.
4. **Anon account-creation cap** — add now, or defer until an economy exists.
5. **Umami website-id** — operator must create the website to unblock step 6.
6. **WeChat 主体** (个人 vs 企业) for registration — affects available 类目 and review path.
