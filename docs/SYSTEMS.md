# 核心系统 (Core Systems)

This is a pure design task — no code to read, no provider/LLM work involved (the product explicitly forbids runtime LLM calls). I'll produce the spec directly.

---

# 云宠物 — Core Game Systems Spec (V1)

Server-authoritative, compute-on-read, fully offline-deterministic. No runtime LLM. All "soul" comes from the copy bank + contextual variety layered on top of these deterministic systems.

Conventions used throughout:
- All stats are integers `0–100` unless noted.
- All time is **server UTC**; client clock is never trusted.
- `Δh` = real elapsed hours since `last_tick` (a float, e.g. 13.5).
- Recompute happens on every read; persisted state is `(snapshot, last_tick)`.

---

## 0. Persistent Record (the row we store per pet)

```
pet {
  id, user_id, species_id, name,
  // live stats (snapshot at last_tick)
  satiety, mood, cleanliness, energy, health,        // 0–100
  // persistent progression
  bond,            // 0–1000  (亲密度)
  exp,             // 0..∞     (经验)
  stage,           // enum: egg|baby|child|teen|adult
  // bookkeeping
  last_tick,       // UTC timestamp, source of truth for decay
  created_at,      // for "real days elapsed" growth gate
  // soft-fail state machine
  state_flags,     // bitset: SICK, SULKING, HIDING, LONELY
  state_since,     // when current dominant negative state began
  // anti-abuse cooldowns (server timestamps)
  last_feed, last_clean, last_play, last_pet, last_sleep, last_checkin,
  feed_count_today, // resets at user-local 04:00
  // retention
  streak_days, last_active_date, last_seen
}
```

---

## 1. STAT MODEL

Seven live/persistent dials. The five **live stats** decay; **bond** and **exp** only grow (bond can dip slightly, never below earned floors).

| Stat | Range | Start (egg) | Adult cap | Decay/real hr | Primary raisers | Primary lowerers |
|---|---|---|---|---|---|---|
| 饱食 satiety | 0–100 | 70 | 100 | **−4.0/h** | 喂食 +25 (snack +12) | time; play −3; sick −1.5/h extra |
| 心情 mood | 0–100 | 60 | 100 | **−2.5/h** | 玩耍 +18, 抚摸 +10, feed-when-hungry +8 | time; dirty/hungry/sick penalties; ignored streak |
| 清洁 cleanliness | 0–100 | 80 | 100 | **−3.0/h** | 洗澡 +40 (→ clamp 100) | time; play −5; sick −1/h extra |
| 精力 energy | 0–100 | 80 | 100 | **−3.5/h while awake**, **+9/h while asleep** | 哄睡 (sleep mode), natural night regen | play −8, time awake |
| 健康 health | 0–100 | 90 | 100 | **0 baseline** (derived, see cross-effects) | 看医生 +40, time spent in good care | cross-effect drains only |
| 亲密度 bond | 0–1000 | 0 | 1000 | **−0.05/h** (tiny, floored) | every care action +1..+5, daily check-in +8, streaks | only the tiny decay; never below `floor = stage_min_bond` |
| 经验 exp | 0..∞ | 0 | — | never decays | care actions +5..+15, daily check-in +20 | never |

### Decay formula (per live stat)
For a stat `S` with decay rate `r` (per hour) and an effective rate `r_eff` (after modifiers below):

```
S' = clamp(S − r_eff · Δh, 0, cap_for_stage(stat))
```

Energy is the exception (regenerates while asleep):
```
if asleep:  energy' = clamp(energy + 9·Δh, 0, cap)
else:       energy' = clamp(energy − 3.5·Δh, 0, cap)
```

### Decay-rate modifiers (multiplicative on `r`)
- **Bond comfort**: `r_eff = r · (1 − 0.30·(bond/1000))` for mood and satiety only. A maxed-bond pet decays mood/hunger 30% slower — "it trusts you, it waits more patiently."
- **Sleep**: while asleep, satiety decay `×0.5`, mood decay `×0.25`, cleanliness decay `×0.5`.
- **Sickness**: while `SICK`, satiety decay `×1.4`, cleanliness `×1.2` (sick pets get messier/hungrier).
- **Stage**: babies decay a touch faster (needier): `×1.15` for stages egg/baby; `×1.0` child; `×0.9` teen/adult (more self-sufficient).

### Health — the derived stat (cross-effects)
Health has **no flat decay**. It moves only from the condition of the other stats, evaluated continuously over `Δh`:

```
neglect = 0
if satiety  < 20:  neglect += 1.5/h
if cleanliness < 20: neglect += 1.5/h
if energy   < 15:  neglect += 1.0/h
if mood     < 15:  neglect += 0.5/h          // misery is mildly unhealthy

recovery = 0
if satiety≥60 AND cleanliness≥60 AND energy≥50 AND not SICK:
    recovery += 1.0/h                          // good care slowly heals

health' = clamp(health − neglect·Δh + recovery·Δh, 0, cap)
```

- When `health` crosses **below 30** → set `SICK` flag. The pet visibly droops, sneezes, refuses some food.
- `SICK` clears when `health ≥ 60` (via 看医生 or sustained good care). Hysteresis (30 down / 60 up) prevents flicker.

### Cross-effect summary (the "living system" feel)
- Low satiety **and** low cleanliness sustained → health bleeds → sickness.
- Sickness accelerates satiety/cleanliness decay → a gentle downward spiral, but every step is reversible in one or two actions.
- High bond slows mood/satiety decay → loyal pets are more forgiving of busy days.
- Low mood (sulky) gates some interactions (see §4) but never blocks recovery actions (feed/clean/medicine/抚摸 always work).

---

## 2. WALL-CLOCK TICK / DECAY (server-authoritative, compute-on-read)

### Source of truth
On **every read** of the pet (open app, refresh, any action), the server runs `recompute(pet, now_utc)`:

```
def recompute(pet, now):
    Δh = max(0, (now − pet.last_tick).hours)         # negative clamped to 0 (clock skew guard)
    Δh = min(Δh, 720)                                 # cap at 30 days of decay; beyond this is the "worst case" floor
    apply_decay(pet, Δh)                              # formulas in §1, integrating sleep windows
    apply_cross_effects(pet, Δh)                      # health
    resolve_state_flags(pet)                          # SICK/SULKING/HIDING/LONELY transitions
    pet.last_tick = now
    persist(pet)
    return pet
```

**Sleep windows inside Δh:** if `Δh` spans night hours, integrate piecewise. Simplification for V1: a pet is "asleep" only when the user explicitly 哄睡s it OR during a fixed quiet window `[user_local 23:00, 07:00)` *if last interaction was a 哄睡 that night*. To keep the integral cheap, split `Δh` at each 23:00/07:00 boundary it crosses and apply the awake/asleep rate per segment. At most ~`ceil(Δh/12)+1` segments — trivial.

### Why compute-on-read is the source of truth
- Deterministic: same `(snapshot, last_tick, now)` always yields the same result. No drift, no double-applying.
- Stateless between reads: we never need a tick to have "fired" for the math to be right.
- Cheap: O(segments) arithmetic, no per-minute jobs.

### Optional nightly cron tick (NOT source of truth)
A single cron at **user-local ~20:00** (batch by timezone bucket) does three things, none of which the math depends on:
1. **订阅消息 reminders** — for users who opted in, if `now − last_seen > 20h` AND any stat is trending low, queue one gentle 微信订阅消息 (§5). Compute-on-read still produces correct stats whenever they actually open.
2. **/status heartbeat** — `touch /home/liharr/.local/share/cron-heartbeats/cloudpet-tick` so the status dashboard sees freshness. Weekend-tolerant threshold.
3. **State pre-warm** (cosmetic) — optionally persist a recompute so leaderboard/preview reads are fresh without a user open. Idempotent because it just calls `recompute`.

If the cron never runs, the game is still fully correct — it only loses reminder pushes and the heartbeat.

### Anti-abuse (client clock untrusted; no spam-to-max)
- **Server timestamps only.** `last_tick`, all cooldowns, `now` come from the server. A client-sent timestamp is ignored entirely.
- **Negative/forward skew guard:** `Δh` clamped to `[0, 720]`. Setting your phone clock forward does nothing (server `now` is used); backward does nothing (clamped to 0).
- **Per-action cooldowns (server-enforced):**

  | Action | Cooldown | Daily cap |
  |---|---|---|
  | 喂食 (meal) | 90 min | 6 meals/day |
  | 喂零食 (snack) | 30 min | 4/day |
  | 洗澡 | 4 h | — (no point spamming, clamps to 100) |
  | 玩耍 | 20 min | — (costs energy, self-limiting) |
  | 抚摸 | 5 min | 20/day (bond +1 each, capped) |
  | 哄睡 | once per night window | 1 |
  | 看医生 | 6 h | — |
  | 每日签到 | 1 / user-local day | 1 |

  Action handler: `if now − last_<action> < cooldown: reject (return remaining)`. Gains are **capped by clamp**, so even at the cooldown limit you can't exceed `cap_for_stage`.
- **Diminishing returns within a day:** feeding when `satiety > 80` gives only `+8` (overfeeding wastes food and nudges mood down `−2`, "吃太撑了"). This removes the incentive to grind.
- **No client-authoritative gains.** The client requests an action verb; the server validates cooldown + state, applies the delta, and returns the new authoritative snapshot. The client only renders.

---

## 3. GROWTH / LIFE STAGES

Five stages. Tuned so an attentive player reaches **adult in ~3 weeks**, a casual one in ~5–6 weeks. Growth is gated on **both** EXP and real days, so you cannot rush it by grinding actions in one sitting.

| Stage | EXP req (cumulative) | Min real days since hatch | Sprite | Stat caps | Unlocks |
|---|---|---|---|---|---|
| 🥚 egg | 0 | 0 | egg + idle shimmer | all caps 80 | 抚摸(暖蛋), 看护, daily check-in only |
| 🐣 baby | 120 | 1 | baby form | 85 | + 喂食, 洗澡, basic 心声 |
| 🐥 child | 400 | 5 | child form | 90 | + 玩耍, 哄睡, mood-flavored copy expands |
| 🦊 teen | 1000 | 12 | teen form | 95 | + 看医生 self-request, 小情绪 (sulk/hide), nicknames |
| 🌟 adult | 2200 | 21 | adult form | 100 | full copy bank, all moods, "本命" badge, seasonal variants |

### Advancement rule
At each `recompute`, after stats settle:
```
next = stage_table[stage+1]
if exp ≥ next.exp_req AND days_since(created_at) ≥ next.min_days AND bond ≥ next.bond_gate:
    promote(pet, next)        # swap sprite, raise caps, unlock verbs, fire 成长 copy + 微信订阅消息 if opted in
```
`bond_gate`: egg→baby 0, baby→child 60, child→teen 180, teen→adult 400. So growth requires *relationship*, not just clicks — a neglected-but-fed pet stalls at the bond gate. This also sets each stage's `stage_min_bond` floor (bond can't decay below it).

### EXP sources
- 喂食 +10 · 洗澡 +8 · 玩耍 +12 · 哄睡(full night) +15 · 看医生 +8 · 抚摸 +2 (capped 20/day) · 每日签到 +20 · streak milestone (7/30 day) +50/+150.
- A balanced day of care ≈ 80–120 EXP. Crosses one early stage every few days; the `min_days` gate stretches the later ones so adulthood *feels earned over weeks*.

### What changes at each stage (beyond sprite)
- **Caps rise** (80→100): an adult can be cared for "more fully," giving veterans headroom.
- **Verbs unlock progressively** so onboarding isn't overwhelming — egg is just warmth + check-in.
- **Copy bank widens**: each stage tags lines; later stages unlock 小情绪 (sulk/hide) and richer 心声, so the personality visibly "matures."
- **Decay eases** (stage multiplier 1.15 → 0.9): adults are lower-maintenance, rewarding loyalty.

---

## 4. SOFT-FAIL & RECOVERY

Negative states are derived from thresholds, surfaced as `state_flags`. **Never death, never permanent loss.** Recovery actions are *always* available regardless of mood.

| State | Trigger | Visible manifestation | Recovery (always works) |
|---|---|---|---|
| 饿 hungry | satiety < 30 | sprite slumps, "肚子叫"动画, food-themed 心声 | 喂食 (+25). Instant. |
| 脏 dirty | cleanliness < 30 | dust/flies overlay, 嫌弃脸, dimmer palette | 洗澡 (+40 → clamp). One tap. |
| 困 sleepy | energy < 25 | half-lidded eyes, yawn loop, slower idle | 哄睡 → sleep mode regens +9/h; or it naps itself at night. |
| 生病 sick | health < 30 | pale/green tint, sneeze, droopy SICK sprite, refuses snacks | 看医生 +40 (clears at health≥60), or sustained good care heals +1/h. |
| 闹脾气 sulky | mood < 25 for > 2h | turns away, 鼓腮 pout, declines 玩耍 ("现在不想玩…") | 抚摸 +10 & 喂食 lift mood; comfort it. Recovers in minutes of attention. |
| 赌气躲起来 hiding | mood < 12 **and** ignored (no interaction) > 36h | pet partially hidden (in a box / behind plant), only a tail showing, muted 心声 | a few 抚摸 + one feed coaxes it out within the session; copy is sheepish-then-forgiving, never guilt-tripping. |
| 孤单 lonely | no interaction > 48h (independent of stats) | sits by the "door," looks at screen, wistful 心声 | any single interaction resets it; bonus mood +6 on the reunion ("你回来啦"). |

### State precedence (dominant state for sprite/copy)
`SICK > HIDING > SULKING > 困 > 饿 > 脏 > LONELY > 正常`. Only the dominant state drives the main sprite/animation; secondary needs surface as small badge icons.

### Worst case — "I ignored it for 2 weeks"
With `Δh` clamped at 720h, after long absence the pet lands at a **floored low state, not zero-everything misery**:
- satiety/mood/cleanliness/energy bottom out but are **floored at 5** (not 0) by a `neglect_floor` so the reunion isn't bleak.
- health floored at **15** (so SICK, but not near-zero).
- State = `HIDING` (mood floored low + long ignore), `SICK`, `LONELY`.
- Bond decayed only slightly (−0.05/h ≈ −0.84 over 14 days) and never below `stage_min_bond` — **the relationship survives**.

**Gentle path back (one session, ~2 min):**
1. Open → warm reunion copy: *"…（探出头）你…回来了。我就知道你会回来的。"* (sheepish, relieved, never accusatory).
2. 抚摸 ×3 → coaxes out of HIDING, mood +30, LONELY cleared with reunion bonus.
3. 喂食 → satiety restored, mood +8.
4. 看医生 → health +40, SICK cleared.
5. 洗澡 → clean.
End state after ~5 taps: a happy, clean, fed pet and an intact bond. The whole arc is **designed to be a touching reunion, not a punishment.** A small "我们的重逢" 心声 + EXP bonus rewards coming back.

---

## 5. DAILY LOOP & RETENTION (no nagging)

### The 60-second daily ritual
1. **Open → 每日签到** (1 tap): bond +8, EXP +20, advances streak, rolls daily gift.
2. **A daily 心声** (the heart): one contextual line from the copy bank, selected by `(stage, dominant_mood, time_of_day, weather, streak_tier, recent_action, days_known)`. This is the line users screenshot. Never repeats same line two days running (anti-repeat ring buffer of last 10).
3. **Feed → Clean → Play** (3 taps): restores the core stats, EXP, bond.
4. **抚摸 / 哄睡** as the closer (mood + bond).

Total: ~6 taps, under a minute. Doing it daily keeps all stats green and the streak alive.

### Streaks (reward, don't punish)
- `streak_days` increments if the user does ≥1 care action on a given user-local day.
- A missed day **does not zero the streak** — it has a **1-day grace** (streak freezes, doesn't reset) the first miss; second consecutive miss soft-resets to `floor(streak/2)`, not 0. No guilt; the pet just says it missed you.
- Milestones: 3-day (snack pack), 7-day (+50 EXP, cosmetic), 30-day (+150 EXP, seasonal accessory). Cosmetic/soft rewards only.

### Daily gift (soft economy)
Check-in rolls from a small table: `3× 普通粮 | 1× 零食 | 1× 肥皂 | 5 爱心(currency)`. Streak tier weights it toward better rolls. Enough to cover a day of care without grinding — the economy exists to give the daily tap a tiny payoff, not to create scarcity.

### 微信订阅消息 — the gentle return loop
WeChat one-off subscribe messages are **per-message consent**, which fits "no nagging" perfectly:
- On meaningful moments we *ask* for one subscription: after hatching, on a streak milestone, or when the user explicitly taps "提醒我照顾它." Each tap authorizes exactly **one** future push.
- The nightly cron (§2) sends at most **one** message per user per ~24–36h, and only when there's a genuine reason: a stat is genuinely low, the pet just grew a stage, or a streak is about to lapse (grace-day reminder).
- Copy is warm and pet-voiced, never a manipulative "你的宠物快死了!": e.g. *"今天有点想你，等你回来一起玩呀～"* (with stage/mood flavor). Because each push consumes one authorized subscription, the platform itself caps frequency — structurally impossible to spam.
- Opt-out is implicit: if the user stops re-authorizing, pushes simply stop. The game remains fully playable and the pet fully recoverable whenever they return.

---

## 6. ACTIONS & ECONOMY

### Verbs (server-validated; each returns authoritative snapshot)

| Verb | Effect | Cost | Cooldown | EXP | Bond | Notes |
|---|---|---|---|---|---|---|
| 喂食 (meal) | satiety +25 | 1 普通粮 | 90 min | +10 | +3 | overfeed (>80) → +8 only, mood −2 |
| 喂零食 (snack) | satiety +12, mood +5 | 1 零食 | 30 min | +4 | +2 | refused while SICK |
| 洗澡 | cleanliness → +40 (clamp) | 1 肥皂 | 4 h | +8 | +3 | play afterward feels fresh (mood +2) |
| 玩耍 | mood +18, energy −8, cleanliness −5 | free | 20 min | +12 | +4 | declined while SULKING/SICK |
| 抚摸 | mood +10, bond +1 | free | 5 min (cap 20/day) | +2 | +1 | always available, the comfort verb |
| 哄睡 | enter sleep mode (energy +9/h) | free | 1/night | +15 on full night | +5 | best at night window |
| 看医生 | health +40, clears SICK at ≥60 | 5 爱心 | 6 h | +8 | +2 | pet may "self-request" when sick |
| 每日签到 | bond +8, EXP +20, roll gift | free | 1/day | +20 | +8 | the ritual anchor |

### Items & currency (minimal, no real money in V1)
- **普通粮 / 零食 / 肥皂** — consumables. Sources: daily check-in gift, milestone rewards, occasional 玩耍 find. Start kit: 5 普通粮, 2 零食, 2 肥皂.
- **爱心 (hearts)** — the single soft currency. Earned via check-in (5/day base, more with streak) and milestones. Spent only on 看医生 (5) and, post-V1, cosmetics. Start: 20.
- **No shop / no IAP in V1.** Daily check-in fully funds a normal day of care (a day costs ≈ 2–3 粮, 1 肥皂, 0–1 看医生). Balance target: an attentive player never runs dry; a returning-from-absence player gets a small care-package gift on reunion so recovery is frictionless.

### Economy invariants
- Every gain is server-applied and clamp-bounded → no spam-to-max.
- Currency only ever *eases* care; it can never gate recovery (a broke player can still 抚摸/玩耍/哄睡 for free, and reunion gifts cover medicine). Soft, reversible, cozy — by construction.

---

### Implementation note for the engineer
The entire runtime is: `recompute()` (pure function of snapshot + elapsed time) → `apply_action()` (cooldown check + clamped delta) → `resolve_state_flags()` → `select_copy(context)` against the segmented bank. Three pure functions plus a copy selector. No external calls, fully deterministic, trivially unit-testable by feeding synthetic `Δh` values. The copy bank is data, not code — write it rich, tag it by `(stage, mood, time, weather, streak, event)`, and the "soul" emerges from selection variety.
