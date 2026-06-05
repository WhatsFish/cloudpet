# 灵气 / 文案系统 (Copy System)

This is a pure design task within a locked spec. No code to read, no LLM provider work (the product explicitly forbids runtime LLM calls), and no skill matches a copywriting/design deliverable. I'll produce the spec directly.

# 云宠物 COPY ("灵气") SYSTEM — Architecture + Sample Content (V1)

The personality engine is rule-based and offline. The "soul" is bought entirely with (a) a segmented copy bank authored archetype-first, and (b) a selection layer that rotates lines across context so nothing feels canned. This document defines the model, the taxonomy, the diary engine, three real voice packs, and an authoring plan that keeps the writing budget finite.

---

## 1. COPY ARCHITECTURE

### 1.1 The line record (data, not code)

Every line is a row. The bank is authored as data and selected at runtime by a pure function. One line:

```
line {
  id,                       // stable, e.g. "greet.return.ember_imp.sulky.003"
  event,                    // CONTEXT EVENT key (taxonomy §1.3)
  voice,                    // archetypeKey  (mochi_pudding, ember_imp, ...)  — primary segmentation
  // selection predicates (ALL must match the runtime context to be eligible)
  requires: {
    stage?:        [egg|baby|child|teen|adult]   // stage gate (later events unlock with stage)
    mood_band?:    [极好|好|平|低|极低]            // bucketed from mood stat
    state_flag?:   [SICK|SULKING|HIDING|LONELY|none]
    time_band?:    [清晨|白天|傍晚|深夜]           // user-local
    weather?:      [晴|阴|雨|雪|热|冷]             // optional
    streak_tier?:  [新|稳定|长期|回归]
    recent_action?:[fed|overfed|cleaned|played|petted|medicated|ignored]
    days_known?:   [新生|相识|老友]               // bucketed from created_at age
  },
  // template + slots (see §1.5)
  text,                     // may contain {slots}
  slots?: { name, kaomoji, foodLove, ... },   // slot-pool references
  // selection tuning
  weight,                   // default 10; rarer/spicier lines weighted lower
  tags,                     // free: "screenshot-bait", "seasonal", "milestone"
}
```

**Authoring principle (load-bearing):** the bank is authored **archetype-first** — a writer sits down as `ember_imp` and writes that creature's *whole* voice across all events, the way you'd write one character's dialogue. This protects tonal consistency (the 灵气) far better than authoring intent-first and swapping names. Name-swapping is the canned-feeling trap; we forbid it.

### 1.2 Selection algorithm (pure, deterministic-seeded)

```
select_copy(event, pet, ctx):
    pool = bank[event][pet.voice]                      # archetype-segmented first
    pool = filter(pool, l => predicates_match(l.requires, ctx))
    if pool empty: pool = fallback_chain(event, pet)   # §1.6 graceful degradation
    pool = drop(pool, recently_used_ring[event][pet.id])  # anti-repeat cooldown
    if pool empty: pool = recently_used_ring.oldest_half # if we exhausted, allow oldest back
    line = weighted_random(pool, seed = hash(pet.id, event, day, salt))
    fill_slots(line, ctx)                              # §1.5
    recently_used_ring[event][pet.id].push(line.id)    # ring size N (see below)
    return rendered_text
```

**Weighted random**: `weight` lets us make a spicy/rare line (a confession, a seasonal gag) show up ~1/5 as often as a workhorse line, so the special ones stay special.

**Recently-used cooldown (anti-repeat)**: a per-`(event, pet)` ring buffer of the last *N* served `line.id`s; those are excluded from the next draw.
- Ring size scales with pool size: `N = clamp(round(pool_size * 0.6), 3, 12)`.
- The **每日心声/日记** has a dedicated, larger ring (last 10 *days*) because it's the screenshot line — never repeat within ~10 days.

**Seed**: seeding the RNG on `hash(pet.id, event, day-bucket, salt)` makes a given pet's line stable within a session/day (re-opening the app doesn't reroll the greeting every refresh — feels like the pet *meant* it), while still varying across days and across pets.

### 1.3 CONTEXT EVENT TAXONOMY

The full event set. **Which dimensions select the variant** is listed per event. Every event is archetype-segmented (`voice` always selects); the extra predicates below are what *further* split the pool.

| # | Event key | Trigger | Primary selectors (beyond `voice`) | Notes |
|---|---|---|---|---|
| **Greetings & sessions** |
| 1 | `greet.open` | app opened, normal | time_band, mood_band, streak_tier, days_known | the workhorse; biggest pool |
| 2 | `greet.return` | open after 24–48h gap | streak_tier=回归, mood_band, days_known | warm "你回来啦", never accusatory |
| 3 | `greet.return.long` | open after >48h (LONELY/HIDING) | state_flag, days_known | the reunion arc (§4 of core spec) |
| 4 | `greet.morning` | open in 清晨 band | weather, mood_band | clean-slate energy |
| 5 | `greet.latenight` | open in 深夜 band | mood_band, weather | wisp_moth flips polarity here |
| **Care reactions** |
| 6 | `feed.love` | fed a LOVED food tag | mood_band, recent_action | + special eat anim |
| 7 | `feed.neutral` | fed neutral food | mood_band | workhorse |
| 8 | `feed.dislike` | fed a DISLIKED food | (archetype-defining refusal) | pout/refuse anim |
| 9 | `feed.overfed` | fed while satiety>80 | — | "吃太撑了", mood −2 |
| 10 | `feed.sick_refuse` | feed/snack while SICK | state_flag=SICK | refuses snacks |
| 11 | `clean.react` | 洗澡 | mood_band, weather(冷→畏寒) | fresh-and-fluffy |
| 12 | `play.react` | 玩耍 success | mood_band, time_band, energy_band | curio pets pop here |
| 13 | `play.declined` | 玩耍 while SULKING/SICK/low-energy | state_flag | "现在不想玩…" |
| 14 | `pet.react` | 抚摸 | mood_band, state_flag(HIDING coax) | the comfort verb |
| 15 | `sleep.tuck` | 哄睡 enter sleep | time_band | best at night |
| 16 | `sleep.wake` | wakes after a night | streak_tier | morning-after |
| 17 | `medicine.react` | 看医生 | state_flag(SICK→relief) | recovery beat |
| 18 | `checkin.daily` | 每日签到 | streak_tier, days_known | ritual anchor |
| **State / mood** |
| 19 | `state.hungry` | satiety<30 idle barks | mood_band | food-themed 心声 |
| 20 | `state.dirty` | cleanliness<30 | — | 嫌弃脸 lines |
| 21 | `state.sleepy` | energy<25 | time_band | yawns |
| 22 | `state.sick` | SICK idle | days_known | droopy, soft |
| 23 | `state.sulky` | SULKING (mood<25, 2h) | days_known | 闹脾气 — archetype-defining |
| 24 | `state.hiding` | HIDING | — | muted, sheepish 心声 |
| 25 | `state.lonely` | LONELY (no interaction 48h) | days_known | by-the-door wistful |
| 26 | `mood.elated` | mood ≥ 90 (心情极好) | recent_action, time_band | the joy peak |
| **Personality flavor** |
| 27 | `idle.mutter` | random idle 碎碎念 | time_band, weather, mood_band, recent_action | huge variety pool; the ambient soul |
| 28 | `beg.want` | 撒娇要东西 (low stat → asks) | which_stat (饿/脏/无聊), express-axis | clingy pets only; 理性 pets ask dryly/rarely |
| 29 | `weather.react` | weather change while open | weather, archetype tilt | rain delights dream_jelly, chills mochi |
| 30 | `growth.promote` | stage advance | new_stage, days_known | milestone copy + push |
| 31 | `streak.milestone` | 3/7/30-day hit | streak_tier | celebratory |
| 32 | `bond.confession` | bond crosses 250/500/800 | bond_tier | rare, weighted low, screenshot-bait |
| 33 | `diary.daily` | the 每日心声 (§2) | EVERYTHING (own engine) | emotional centerpiece |
| **Meta** |
| 34 | `reunion.gift` | care-package on return | — | "给你留了点东西" |
| 35 | `name.given` | user names/renames pet | — | one-time |
| 36 | `easter.seasonal` | festival/birthday | season, days_known | weighted-low delight |

### 1.4 State/personality → variant selection (the mapping rules)

- **`voice` (archetypeKey)** always selects the pool first. This is the dominant axis — pools are physically separate per archetype.
- **`express` axis** controls *which events even exist* for an archetype and their density: high-撒娇 (ember, mochi, spark) get fat `beg.want`, `state.sulky`, `mood.elated` pools with 颜文字 and exclamation templates; 理性 (stone_egg, echo_fox, clay_golem) get thin/dry pools and may *omit* `beg.want` (they don't beg). The selector never errors on a missing pool — it falls back (§1.6).
- **`mood_band`** (极好/好/平/低/极低, bucketed from `mood`) re-tones the *same* event: `greet.open` in 极好 vs 极低 reads totally differently within one voice.
- **`state_flag`** overrides mood_band when a dominant negative state is active (precedence per core §4): SICK/HIDING lines supersede normal greet lines.
- **`time_band` / `weather`** are *modifiers*: most lines are time/weather-agnostic (`requires` omits them), but a slice of each pool is time/weather-tagged so that ~1/3 of draws feel "aware of right now." wisp_moth and dream_jelly weight these heavily (it's their gimmick).
- **`streak_tier` / `days_known`** add relationship depth: 老友 lines reference shared history ("又是我们俩的一天"); 新生 lines are shy.
- **`recent_action`** lets a line reference what you *just* did ("刚喂完还来？…那、那再吃一口") — cheap continuity that reads as memory.

### 1.5 Templates + slot fills (multiplier without combinatorial authoring)

A line's `text` can embed `{slots}`. Slots draw from small per-archetype pools, so one template yields many surfaces:

```
text:  "{greet_excl}你回来啦！我今天{idle_self}，就等你了{kaomoji}"
slots:
  greet_excl:  ember_imp → ["哼，", "终于！", "我跟你说，", "你看你你看你，"]
  idle_self:   ember_imp → ["把玩具踹翻了三次", "对着窗户吼了一上午", "练习了新的扑你姿势"]
  kaomoji:     ember_imp → ["(•̀ㅂ•́)", "(*｀д´)", "(>﹏<)"]
```

One template × (4 × 3 × 3) slot combos = 36 surface forms from a single authored row. **Rule:** slot pools are *archetype-scoped* (an ember kaomoji pool ≠ a stone_egg pool — stone_egg's kaomoji pool is basically `["。", "…", "(´-ω-`)"]`). This is the cheapest, highest-leverage variety lever; the diary (§2) leans on it hardest.

**Guardrail:** slots are constrained pools, never free generation — so every surface form is human-vetted in aggregate. No nonsense lines can be assembled.

### 1.6 Fallback chain (never show nothing, never break voice)

If a fully-predicated pool is empty:
1. Relax the *softest* predicate first (drop `weather` → `time_band` → `recent_action` → `streak_tier`).
2. Then relax `mood_band` to the adjacent band.
3. Then fall back to the archetype's **generic `idle.mutter`** pool (always richly populated) — still in-voice.
4. Last resort: a hand-written per-archetype `voice.default` line. Never a cross-archetype line, never an empty string. Voice integrity > contextual precision.

---

## 2. THE 每日心声 / 日记 (emotional centerpiece)

A once-per-user-local-day line the pet "writes," surfaced at check-in. It must read as *written by this specific creature, today*, occasionally nodding to recent care history — all without AI.

### 2.1 How it's built

The diary is a **3-part templated sentence** drawn from archetype-scoped pools, plus an optional **memory clause** injected when recent history is notable:

```
DIARY = [OPENER] + [BODY (1–2 slots)] + [optional MEMORY CLAUSE] + [SIGNOFF + kaomoji]
```

- **OPENER** — sets the day's frame from `(time_band, weather, streak_tier)`. e.g. 雨天 opener pool, 长期streak opener pool.
- **BODY** — the archetype's characteristic daily thought, with 1–2 slots (`{activity}`, `{feeling}`, `{food}`) drawn from that archetype's pools.
- **MEMORY CLAUSE (the soul move)** — injected only when a `history flag` fired in the last 24h, picked by priority:
  - `leveled_up` → references growth ("我好像…长大了一点点？")
  - `overfed_streak` (fed ≥4×) → "今天吃得有点多，嗝。"
  - `neglected` (no care >36h before today) → gentle "昨天有点想你" (never guilt)
  - `played_a_lot` (≥3 plays) → "今天玩疯了，累但开心"
  - `rainy_streak` / `first_snow` → weather memory
  - `bond_milestone` → a shy confession fragment
  - else → **no** memory clause (keeps it from feeling formulaic; ~40% of days have none).
- **SIGNOFF** — archetype sign-off + kaomoji from scoped pools. stone_egg signs off "。" ; ember signs off "(•̀ᴗ•́)و".

Each part is an independent pool draw with its **own** anti-repeat ring → combinatorial freshness. With ~6 openers × ~8 bodies × ~5 memory clauses × ~5 signoffs per archetype, that's **~1,200 base permutations per archetype** before slot fills — multiplied again by slots into the tens of thousands. The 10-day ring guarantees no felt repeat.

### 2.2 Worked examples (same day's context → three voices)

Context: `streak_tier=长期, time_band=傍晚, weather=雨, history_flag=played_a_lot`.

**布丁团子 (mochi_pudding)** — 黏人/安稳/撒娇:
> 「下雨天…我们窝在一起最舒服了。今天你陪我玩了好久，我抖啊抖地开心了一整天>﹏<。明天…也不要走开好不好？(´；ω；`)」

**影狐 (echo_fox)** — 独立/好奇/理性:
> 「雨。整座城市的声音都被泡软了。今天陪你跑了几趟，还行——你大概以为是你在逗我玩。……随你怎么想吧。(´-ω-`)」

**暴脾气小火苗 (ember_imp)** — 黏人/好奇/撒娇(极):
> 「下、下雨了烦死了！但是！今天玩得超爽的哈哈哈我赢了三次！！累瘫了但是不许走，明天还要再比(•̀ㅂ•́)✧」

Same slots, same history flag — three unmistakably different creatures. That contrast *is* the product.

### 2.3 Why it feels alive (no AI)

- **Memory clause = cheap continuity illusion.** Five history flags, surfaced ~60% of days, make the pet seem to *remember* yesterday. That's the single highest-ROI trick.
- **Independent rings per part** mean even on a low-content day the assembled whole is fresh.
- **Voice-locked pools** mean it always sounds like *your* pet, never generic.
- **Restraint** (40% of days have no memory clause, signoffs vary) prevents the template from showing through.

---

## 3. SAMPLE VOICE PACKS (3 distinct archetypes, ~8 key events each)

Three corners of the model: a clingy-cozy-dramatic **布丁团子**, an aloof-clever-dry **影狐**, and a max-amplitude **暴脾气小火苗**. Multiple variants per event show the in-voice range the selector rotates through.

---

### 3.1 布丁团子 (mochi_pudding) — 黏人HIGH · 安稳HIGH · 撒娇HIGH
*Voice register: soft, wobbly, melts at attention, dreads you leaving. Lots of 颜文字, 叠词, trailing「…」. Comfort food & naps. New things scare it.*

**`greet.open` (普通问候)**
- 「你来了你来了！我刚刚还在想你呢，想到打了个嗝(´｡• ᵕ •｡`)」
- 「呜…等你好久了…抱抱我一下下嘛？就一下下。」
- 「（团子凑过来贴住屏幕）今天也…要一直在哦？」

**`greet.return.long` (久未登录回归 / HIDING)**
- 「（从被子里慢慢探出半个头）…你…真的回来了？我没有在哭，刚刚只是…眼睛出汗了(>﹏<)」
- 「我就知道你会回来的…我一直、一直待在老地方等你呢。」

**`feed.love` (喂到爱吃的——软糯甜食)**
- 「布丁——！是温温的布丁！！我最喜欢你了（不是、我是说我最喜欢布丁，也喜欢你）(๑´ㅂ`๑)」
- 「呜呜软软的甜甜的…可以天天都吃这个吗？和你一起吃。」

**`feed.dislike` (喂到害怕的新奇/重口食物)**
- 「这、这是什么…它刚刚是不是动了？！我不要不要(；д；)（缩成一团）」
- 「太刺激了…我们还是吃原来那个好不好…我害怕新东西嘛…」

**`pet.react` (抚摸)**
- 「呼…就是这里…再摸摸嘛(´ ᵕ ` )你的手好暖好暖…」
- 「（整团抖成布丁）好幸福…我可以一直这样下去。」

**`state.sulky` (闹脾气)**
- 「哼…你刚刚是不是去忙别的了…（鼓起腮）我才没有生气…只是有一点点…一点点伤心。」
- 「不理你了…（偷偷瞄你）…除非你抱抱我。」

**`mood.elated` (心情极好)**
- 「今天是世界上最最最好的一天！因为有你呀！(灬º‿º灬)♡ 我要开心到抖个不停！」

**`diary.daily` (每日心声)**
- 「今天也乖乖地待在老地方，软软地等你。窗外有点吵，但只要你在，我就什么都不怕了…明天也要来哦，拉钩(´；ω；`)」

---

### 3.2 影狐 (echo_fox) — 独立HIGH · 好奇HIGH · 理性HIGH
*Voice register: cool, dry, deadpan, withholds. Rare affection lands hard precisely because it's rare. Never begs. Short sentences, period-stops, sly。 Solves puzzles, prowls at night.*

**`greet.open` (普通问候)**
- 「哦，是你。……我刚才正好醒着，不是在等你。」
- 「（瞥了你一眼，又把脸转回去）来了就来了。水我自己喝过了。」
- 「嗯。位置没变,你也没变。还行。」

**`greet.return.long` (久未登录回归 / 独立型——不躲不闹,只是冷淡)**
- 「这么久。……我过得很好,一个人。（尾巴却悄悄绕到你这边）」
- 「你不在的时候我解开了三个谜题。你不在,我也照样精彩。……不过,回来也不算坏。」

**`feed.love` (喂到爱吃的——精致小份/野味)**
- 「唔。这个…份量刚好,味道也对。你居然懂。（难得地多看了食物一眼）」
- 「……还不错。下次也可以是这个。（这已经是它最高的夸奖了）」

**`feed.dislike` (喂到不合口的——廉价大份)**
- 「这么一大坨。你是喂我,还是填坑。……我吃两口,给你面子。」
- 「（嗅了嗅,退后一步）我有我的标准。这个不达标。」

**`pet.react` (抚摸——稀有的接受)**
- 「……只许这一下。（却没有躲开)」
- 「手别停。……我没说喜欢,我只是没说讨厌。」

**`state.sulky` (低落——冷处理而非闹)**
- 「（背对着你,尾巴尖一甩）没事。我只是不想说话。别凑过来。」
- 「你忙你的。我自己待会儿就好了——真的。(并不真的)」

**`mood.elated` (心情极好——克制的高光)**
- 「今天…一切都很合我意。难得。（嘴角几不可察地翘了一下)别声张。」

**`diary.daily` (每日心声)**
- 「夜里巡了一圈,城市很安静,适合一个人。藏好了今天捡到的小东西——回头也许给你看,也许不给。你猜。(´-ω-`)」

---

### 3.3 暴脾气小火苗 (ember_imp) — 黏人HIGH · 好奇MID-HIGH · 撒娇HIGH(情绪幅度最大)
*Voice register: explosive, theatrical,炸毛then扑怀, max exclamation, flips on a dime, easiest to coax. Wants REAL-TIME response. Spicy/碳酸 food, 打闹追逐.*

**`greet.open` (普通问候)**
- 「你！可！算！来！了！我都要原地爆炸了知道吗(•̀ㅂ•́)！」
- 「哼,来这么晚。（下一秒扑过来）算了不计较了想死你了啦！！」
- 「看招！（朝屏幕扑了个空）哈哈哈逗你的——快陪我玩!」

**`greet.return.long` (久未登录回归 / HIDING——闹完秒破涕为笑)**
- 「你你你跑哪去了!!（从箱子后面冲出来）我生气了!超级生气!…（被你一哄）……好吧、好吧不气了,谁让我想你了呢(>﹏<)」
- 「(鼓着腮瞪你三秒,然后绷不住)…哼!下不为例!来抱一个!!」

**`feed.love` (喂到爱吃的——辣口/碳酸)**
- 「哇辣!!!爽!!!就是这个味儿!!!（喷火状）再来一份!不,十份!(*｀д´)b」
- 「碳酸!冲鼻子!嗝——!哈哈哈太刺激了我喜欢你懂我!!」

**`feed.dislike` (喂到不合口的——清淡软食)**
- 「这什么寡淡玩意儿…没味道的!我要带劲的!（一爪子推开）拿走拿走!」

**`pet.react` (抚摸——从炸毛到融化)**
- 「别、别摸头啦很幼稚的…（声音渐渐小下去）…欸…再摸两下也不是不行。」
- 「哼哼~舒服~（瞬间瘫软）你的手有魔法是不是!」

**`state.sulky` (闹脾气——全套大戏)**
- 「不理我是吧?好啊!（转身,跺脚,把玩具踹飞)我!不!玩!了!（偷瞄你有没有看)」
- 「我赌气了!!正式的那种!!除非你说句软话——快说啊!!(｀皿´)」

**`mood.elated` (心情极好)**
- 「今天我天下无敌!!!所向披靡!!!来人啊给我放烟花!!!（原地蹦三尺高)(ﾉ≧∇≦)ﾉ」

**`diary.daily` (每日心声)**
- 「今天又赢麻了!!玩到累瘫但是超开心!!虽然嘴上凶但是…（声音变小)…有你在的每天都很爽啦。明天还要比!不许赖!(•̀ᴗ•́)و」

---

## 4. SCALE ESTIMATE & AUTHORING PLAN

### 4.1 How many lines a satisfying V1 needs

The instinct is "events × archetypes × states = millions." It isn't, because **slots and the selection layer manufacture surface variety from a modest base of authored rows.** Target the *authored base*, let runtime multiply it.

Per-archetype authored target:

| Bucket | Authored rows / archetype | Rationale |
|---|---|---|
| Workhorse events (greet.open, idle.mutter, feed.neutral, play.react, pet.react, checkin) | ~8 events × ~6 rows = **48** | high-frequency → biggest pools |
| Care reactions (feed.love/dislike/overfed, clean, sleep, medicine) | ~7 events × ~4 rows = **28** | medium frequency |
| State/mood (hungry, dirty, sleepy, sick, sulky, hiding, lonely, elated) | ~8 events × ~4 rows = **32** | personality-defining |
| Flavor (beg.want, weather.react, growth, streak, confession, reunion, seasonal) | ~7 events × ~3 rows = **21** | lower frequency, some omitted per archetype |
| Diary parts (openers/bodies/memory/signoffs) | 6+8+5+5 = **24** | combinatorial centerpiece |
| Slot pools (kaomoji, foods, activities, self-actions, etc.) | ~10 pools × ~5 entries = **50 fragments** | the cheap multiplier |
| **Authored rows per archetype** | **~150 rows + ~50 fragments ≈ 200 units** | |

**× 10 archetypes ≈ 2,000 authored units** (≈1,500 full lines + ≈500 slot fragments).

**Effective surface variety** after slots + context predicates: each templated row averages ~10–30 surface forms, so the *felt* bank is **roughly 15,000–40,000 distinct lines** a player could encounter — from ~2,000 hand-written units. That ratio is the entire reason an LLM-free product can feel alive.

This is a tractable copywriting project (a skilled bilingual writer drafts one archetype's ~200 units in ~2–3 focused days), not infinite work.

### 4.2 Pragmatic authoring plan

**Phase 0 — Tooling & schema (before any prose).**
- Lock the line-record schema and a Google-Sheet/CSV authoring format (one tab per archetype, columns = event/requires/text/slots/weight/tags). Designers retune data without touching code.
- Build the slot-pool sheet + a 5-line preview script that renders random surface forms for any row so writers *see* the multiplication as they write.

**Phase 1 — Write 3 reference archetypes to "gold" (the bar).**
- Author `mochi_pudding`, `echo_fox`, `ember_imp` **completely** (the three in §3 — they span the corners). These become the **style bible**: each later archetype writer reads the gold pack for their nearest neighbor before starting.
- Internal review pass for voice consistency + screenshot-worthiness on the diary and confession lines.

**Phase 2 — Template harvest.**
- Extract a **shared template skeleton** from the 3 gold packs: the *structure* of each event's lines is reusable across archetypes (e.g. every `greet.return.long` = [hesitation] + [relief] + [in-voice deflection]). New archetypes fill the skeleton in their own register rather than inventing structure. Cuts per-archetype time ~40%.
- Build the **slot-pool starter kit**: kaomoji/food/activity pools are partly shareable (curio pets share an "adventure activity" pool; 安稳 pets share a "comfort activity" pool), authored once and tinted per archetype.

**Phase 3 — Fill remaining 7 archetypes, neighbor-batched.**
- Batch by axis-neighborhood so a writer stays in a tonal zone: write the 撒娇-loud cluster (spark_sprite, puff_seal) right after ember/mochi while that voice muscle is warm; write the 理性 cluster (stone_egg, clay_golem) right after echo_fox; write the dreamy/quiet pair (dream_jelly, wisp_moth) together.
- Per-archetype budget: ~200 units, ~2 days each with the skeleton + starter kit.

**Phase 4 — Coverage QA (automated + human).**
- **Automated gap check**: a script asserts every `(event × archetype)` cell has ≥ minimum rows for that event's frequency tier, and every `requires` predicate combo the runtime can produce has a non-empty pool *or* a defined fallback. No silent empty pools.
- **Repeat-feel audit**: simulate 30 days of play per archetype, dump the served lines, eyeball for any felt repetition or template bleed-through; widen thin pools.
- **Screenshot pass**: hand-polish the ~5 highest-visibility events (diary, confession, hatch/reveal, milestone, long-reunion) per archetype — these carry the marketing and the bond.

**Phase 5 — Live tuning (data, not redeploy).**
- Because the bank is data, post-launch we add seasonal/event lines and reweight without code changes. Track which lines get screenshotted/shared (if instrumented) and weight the bank toward what lands.

**Scope discipline:** V1 ships **all 10 archetypes at ~200 units each**. If timeline slips, cut *flavor-event depth* (fewer weather/seasonal variants) before cutting *archetype count* — having your matched 本命 fully voiced matters more than edge-case weather lines, and one-pet-per-user means each player only ever experiences one archetype deeply.

---

### One-paragraph summary for the team
Author the bank **archetype-first as characters**, store it as **data keyed by `(event × voice × state × modifiers)`**, and let a **pure weighted-random selector with per-event anti-repeat rings + slot fills + a fallback chain** manufacture tens of thousands of felt surface forms from ~2,000 hand-written units. The **每日心声/日记** — a 3-part templated line with an occasional memory clause that nods to yesterday's care — is the emotional centerpiece and the cheapest, highest-ROI illusion of a living, remembering pet. No LLM, fully offline, deterministic, and the 灵气 lives entirely in the writing and the rotation.
