# 技术架构 (Tech Architecture)

I have everything needed to produce an exact-convention architecture. Here is the deliverable.

---

# 云宠物 (cloudpet) — Technical Architecture (V1)

WeChat pixel-pet mini-game. Mirrors the `quit-diary` project exactly. **Project key: `cloudpet`**. **Reserved port: 3012.** No runtime LLM — pure rule-based, server-authoritative, compute-on-read.

> WeChat naming note (carried over from quit-diary's review experience): the public mini-program name is framed as **「领养」/「性格测试」**, never **抽奖/抽卡/博彩**. The acquisition mechanic is a 性格测试 → 领养本命宠, not a gacha pull.

---

## 1. Repo Layout

Mirrors `quit-diary` one-for-one (`miniprogram/` native TS client + `web/` Next.js 14 backend + `db/` + `docker-compose.yml` + `.env.example` + `README.md`). New vs. quit-diary: a `web/src/data/` server-side data layer (copy bank + bestiary + rules), and `miniprogram/assets/sprites/` for the curated pixel sheets.

```
/home/liharr/src/cloudpet/
├── .env.example
├── .gitignore                      # excludes .env, node_modules, .next  (copy quit-diary's)
├── README.md
├── icon.png  icon.svg
├── db/
│   ├── bootstrap.sh                # role+db as `umami` superuser, then schema.sql (idempotent)
│   └── schema.sql                  # §2
├── docker-compose.yml              # §6 — port 127.0.0.1:3012:3000, network traffic-monitor_default
├── docs/
│   └── SETUP.md
├── miniprogram/                    # native WeChat, TS flavor. No Taro/uni-app.
│   ├── app.json                    # pages + tabBar
│   ├── app.ts                      # onLaunch → ensureUserId()
│   ├── app.wxss
│   ├── package.json  tsconfig.json  sitemap.json  project.config.json
│   ├── assets/
│   │   └── sprites/<archetypeKey>/ # curated pixel sheets: egg.png baby.png … + mood frames (§5)
│   ├── pages/
│   │   ├── quiz/        quiz.{json,ts,wxml,wxss}      # onboarding 性格测试 (first-run only)
│   │   ├── hatch/       hatch.{json,ts,wxml,wxss}     # egg-hatch reveal (name+line first, sprite after)
│   │   ├── home/        home.{json,ts,wxml,wxss}      # 宠物主页: sprite + stats + action buttons (tab)
│   │   ├── diary/       diary.{json,ts,wxml,wxss}     # 心声/日记 timeline (tab)
│   │   ├── codex/       codex.{json,ts,wxml,wxss}     # 图鉴: 10 archetypes, locked/unlocked (tab)
│   │   └── me/          me.{json,ts,wxml,wxss}        # 我的: streak, items, 订阅消息 opt-in (tab)
│   └── utils/
│       ├── api.ts                  # wx.request wrapper, X-User-Id header (copy quit-diary)
│       ├── auth.ts                 # wx.login → POST /api/login → store user_id (copy quit-diary)
│       └── format.ts              # stat bars, time-ago helpers
└── web/                            # Next.js 14 App Router, standalone, basePath /cloudpet
    ├── .dockerignore               # excludes .env*  (copy quit-diary)
    ├── Dockerfile                  # node:22-bookworm-slim, standalone, PORT 3000 (copy verbatim)
    ├── next.config.js              # { basePath: "/cloudpet", output: "standalone" }
    ├── package.json                # next 14.2.18, react 18.3.1, pg 8.13.x  (fleet-pinned)
    ├── postcss.config.js  tailwind.config.ts  tsconfig.json  next-env.d.ts
    └── src/
        ├── app/
        │   ├── layout.tsx          # Umami via next/script, gated on NEXT_PUBLIC_UMAMI_*
        │   ├── page.tsx            # landing page at /cloudpet (marketing + QR)
        │   ├── globals.css
        │   └── api/                # §3
        │       ├── login/route.ts
        │       ├── quiz/route.ts
        │       ├── pet/route.ts
        │       ├── pet/diary/route.ts
        │       ├── action/route.ts
        │       └── subscribe/route.ts
        ├── lib/
        │   ├── db.ts               # pg Client, config() from PG_* env (copy quit-diary)
        │   ├── auth.ts             # getUserId(req) from X-User-Id, validated (copy quit-diary)
        │   ├── wechat.ts           # exchangeCodeForOpenid (copy quit-diary)
        │   ├── types.ts            # Pet, PetState, QuizResult, ActionResult, …
        │   ├── tick.ts             # recompute() — pure decay + cross-effects + state flags (§2 spec)
        │   ├── actions.ts          # apply_action(): cooldown check + clamped delta
        │   ├── stages.ts           # growth/stage table + advancement rule
        │   ├── quiz.ts             # scoring → 3D vector → weighted nearest archetype + tiebreak
        │   └── copy.ts             # select_copy(context) against the segmented bank
        └── data/                   # ← the heart. Versioned, pure data. No code paths branch on it.
            ├── bestiary.ts         # 10 archetypes: axis targets, decay multipliers, food/activity tags
            ├── quiz-questions.ts   # 6–8 scenario questions + per-answer signed axis weights
            ├── copybank/
            │   ├── index.ts        # loads + indexes all archetype banks
            │   ├── mochi_pudding.ts  sproutling.ts  ember_imp.ts  stone_egg.ts
            │   ├── echo_fox.ts  puff_seal.ts  wisp_moth.ts  clay_golem.ts
            │   └── spark_sprite.ts  dream_jelly.ts
            └── stage-table.ts      # EXP/days/bond gates, caps, unlocked verbs per stage
```

---

## 2. Postgres Schema — `db/schema.sql`

Idempotent (`CREATE TABLE IF NOT EXISTS`). One bonded pet per user (enforced by a `UNIQUE` on `pet(user_id)`). The **compute-on-read tick** is supported by `pet_state` carrying the live snapshot + `last_tick`. Bootstrap (`db/bootstrap.sh`) is the quit-diary script with `quit_diary`→`cloudpet` substituted, connecting as the `umami` superuser.

```sql
-- Idempotent schema for cloudpet. Run via db/bootstrap.sh (as umami superuser).

-- ── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_user (
  user_id           TEXT        PRIMARY KEY,                 -- openid, or anon-<uuid>
  is_anonymous      BOOLEAN     NOT NULL DEFAULT FALSE,
  tz_offset_minutes INTEGER     NOT NULL DEFAULT 480,        -- client local-day boundary (default UTC+8)
  sub_opt_in        BOOLEAN     NOT NULL DEFAULT FALSE,      -- has authorized any 订阅消息
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Onboarding quiz result (axis vector + matched archetype) ─────────────────
CREATE TABLE IF NOT EXISTS quiz_result (
  id            BIGGENERATED-LIKE  -- see below
  user_id       TEXT        NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  attach        INTEGER     NOT NULL,                        -- 黏人(+) ↔ 独立(-)   roughly [-8,8]
  curio         INTEGER     NOT NULL,                        -- 好奇(+) ↔ 安稳(-)
  express       INTEGER     NOT NULL,                        -- 撒娇(+) ↔ 理性(-)
  archetype_key TEXT        NOT NULL,                        -- one of the 10 keys
  answers       JSONB       NOT NULL,                        -- raw answer ids, for reveal "quote-back"
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- (write the id column as:  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY)

CREATE INDEX IF NOT EXISTS idx_quiz_user ON quiz_result (user_id, created_at DESC);

-- ── The bonded pet (one per user) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pet (
  id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       TEXT        NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  archetype_key TEXT        NOT NULL,                        -- creature identity (denormalized from quiz)
  species_id    TEXT        NOT NULL,                        -- sprite/asset pack id (== archetype_key in V1)
  name          TEXT        NOT NULL,
  stage         TEXT        NOT NULL DEFAULT 'egg'
                            CHECK (stage IN ('egg','baby','child','teen','adult')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),          -- birth/hatch time → "real days elapsed" gate
  UNIQUE (user_id)                                           -- exactly ONE bonded pet per user (V1)
);

CREATE INDEX IF NOT EXISTS idx_pet_user ON pet (user_id);

-- ── Live stat snapshot + last_tick (the compute-on-read row) ─────────────────
-- One row per pet. Persisted state is (snapshot, last_tick); recompute() runs
-- on every read using Δh = now - last_tick. Never trust client clocks.
CREATE TABLE IF NOT EXISTS pet_state (
  pet_id          BIGINT      PRIMARY KEY REFERENCES pet(id) ON DELETE CASCADE,
  -- live stats 0–100 (snapshot at last_tick)
  satiety         INTEGER     NOT NULL DEFAULT 70  CHECK (satiety     BETWEEN 0 AND 100),
  mood            INTEGER     NOT NULL DEFAULT 60  CHECK (mood        BETWEEN 0 AND 100),
  cleanliness     INTEGER     NOT NULL DEFAULT 80  CHECK (cleanliness BETWEEN 0 AND 100),
  energy          INTEGER     NOT NULL DEFAULT 80  CHECK (energy      BETWEEN 0 AND 100),
  health          INTEGER     NOT NULL DEFAULT 90  CHECK (health      BETWEEN 0 AND 100),
  -- persistent progression
  bond            INTEGER     NOT NULL DEFAULT 0   CHECK (bond BETWEEN 0 AND 1000),
  exp             BIGINT      NOT NULL DEFAULT 0   CHECK (exp >= 0),
  -- compute-on-read source of truth
  last_tick       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- soft-fail state machine (bitset; readable names mirrored in lib/tick.ts)
  state_flags     INTEGER     NOT NULL DEFAULT 0,            -- SICK=1 SULKING=2 HIDING=4 LONELY=8
  state_since     TIMESTAMPTZ,                               -- when current dominant negative state began
  -- sleep mode (set by 哄睡; energy regen branch in recompute)
  asleep          BOOLEAN     NOT NULL DEFAULT FALSE,
  sleep_since     TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Per-action cooldown + retention bookkeeping (one row per pet) ─────────────
-- Server timestamps only. Cooldowns/daily-caps read here; client clock ignored.
CREATE TABLE IF NOT EXISTS pet_cooldown (
  pet_id          BIGINT      PRIMARY KEY REFERENCES pet(id) ON DELETE CASCADE,
  last_feed       TIMESTAMPTZ,
  last_snack      TIMESTAMPTZ,
  last_clean      TIMESTAMPTZ,
  last_play       TIMESTAMPTZ,
  last_pet        TIMESTAMPTZ,                               -- 抚摸
  last_sleep      TIMESTAMPTZ,                               -- 哄睡 (per-night)
  last_doctor     TIMESTAMPTZ,
  last_checkin    TIMESTAMPTZ,                               -- 每日签到
  feed_count_day  INTEGER     NOT NULL DEFAULT 0,            -- meals today; resets at user-local 04:00
  snack_count_day INTEGER     NOT NULL DEFAULT 0,
  pet_count_day   INTEGER     NOT NULL DEFAULT 0,            -- 抚摸 cap 20/day
  daily_reset_on  DATE,                                      -- user-local date the *_day counters belong to
  streak_days     INTEGER     NOT NULL DEFAULT 0,
  streak_grace    BOOLEAN     NOT NULL DEFAULT FALSE,        -- one-day grace consumed?
  last_active_date DATE                                      -- user-local; streak increments per day
);

-- ── Inventory / soft economy ─────────────────────────────────────────────────
-- Minimal: a few item kinds + 爱心 currency. No IAP in V1.
CREATE TABLE IF NOT EXISTS pet_inventory (
  pet_id      BIGINT  NOT NULL REFERENCES pet(id) ON DELETE CASCADE,
  item_key    TEXT    NOT NULL CHECK (item_key IN ('kibble','snack','soap','heart')),
  qty         INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  PRIMARY KEY (pet_id, item_key)
);

-- ── Action / interaction event log ───────────────────────────────────────────
-- Append-only. Used for: diary/心声 timeline, daily-gift idempotency, streak
-- audit, analytics. A row per server-applied action.
CREATE TABLE IF NOT EXISTS action_log (
  id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pet_id       BIGINT      NOT NULL REFERENCES pet(id) ON DELETE CASCADE,
  user_id      TEXT        NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  verb         TEXT        NOT NULL,                         -- feed|snack|clean|play|pet|sleep|doctor|checkin
  local_date   DATE        NOT NULL,                         -- user-local day (for idempotency / streaks)
  line         TEXT,                                         -- resolved 心声/reaction the user saw (server-picked)
  line_intent  TEXT,                                         -- 'greeting'|'eat'|'refuse'|'reunion'|… (anti-repeat)
  delta        JSONB,                                        -- {satiety:+25, mood:+8, exp:+10, bond:+3}
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_pet_time  ON action_log (pet_id, created_at DESC);
-- enforce "每日签到 once per user-local day": at most one checkin row per (pet, day)
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkin_per_day
  ON action_log (pet_id, local_date) WHERE verb = 'checkin';

-- ── Daily 心声 (the screenshot line) — one per pet per user-local day ─────────
-- Stored so /api/pet/diary can render history and the anti-repeat ring buffer
-- (last 10 line ids) prevents same-line-twice.
CREATE TABLE IF NOT EXISTS voice_log (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pet_id      BIGINT      NOT NULL REFERENCES pet(id) ON DELETE CASCADE,
  local_date  DATE        NOT NULL,
  line        TEXT        NOT NULL,
  line_id     TEXT        NOT NULL,                          -- stable id from copybank, for anti-repeat
  context     JSONB,                                         -- {stage,mood,tod,weather,streak,...} snapshot
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_per_day ON voice_log (pet_id, local_date);
CREATE INDEX IF NOT EXISTS idx_voice_pet_time     ON voice_log (pet_id, created_at DESC);

-- ── 订阅消息 authorizations (each tap = one future push) ──────────────────────
CREATE TABLE IF NOT EXISTS sub_grant (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     TEXT        NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  template_id TEXT        NOT NULL,
  consumed    BOOLEAN     NOT NULL DEFAULT FALSE,            -- flipped true when the cron sends it
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sub_unconsumed ON sub_grant (user_id) WHERE consumed = FALSE;
```

> The `quiz_result.id` line in the block above is illustrative — write it as `id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY` (same as the other tables). Six tables back the whole game; `pet_state` + `pet_cooldown` are the compute-on-read core.

**Why this shape:** `(pet_state.snapshot, pet_state.last_tick)` is the entire authoritative state — `recompute()` is a pure function of those two plus server `now`. `pet_cooldown` holds server timestamps only, so neither cooldowns nor the tick are spoofable from the client. `action_log` partial-unique index makes 每日签到 idempotent at the DB layer; `voice_log` unique-per-day makes the daily 心声 idempotent and feeds the anti-repeat ring buffer.

---

## 3. API Routes (`web/src/app/api/...`)

All routes: `export const dynamic = "force-dynamic"; export const runtime = "nodejs";` and read the user via `getUserId(req)` (the quit-diary `X-User-Id` validator), except `/api/login` (uses `noAuth`). **Every authenticated read/write first calls `recompute(pet, now)`** so the returned snapshot is always ticked-current. `apply_action` validates cooldown + state server-side; the client only renders the returned authoritative snapshot.

| Route | Method | Recompute-on-read? | Purpose |
|---|---|---|---|
| `/api/login` | POST | n/a | wx.login `code` → openid → `user_id` (anon fallback) |
| `/api/quiz` | POST | n/a (creates) | submit quiz answers → match → create bonded pet + egg state |
| `/api/pet` | GET | **yes** | ticked state + today's 心声 + available actions/cooldowns |
| `/api/action` | POST | **yes** | one verb: cooldown+state check → clamped delta → new state + reaction line |
| `/api/pet/diary` | GET | yes (light) | recent 心声 + action history timeline |
| `/api/subscribe` | POST | n/a | record one 订阅消息 authorization (per-message consent) |

### POST `/api/login`  *(verbatim quit-diary route)*
```ts
Req:  { code?: string }
Resp: { user_id: string, is_anonymous: boolean }
```
`exchangeCodeForOpenid(code)` → openid; if WX creds absent → `anon-<uuid>`. Upserts `app_user`.

### POST `/api/quiz`
```ts
Req:  { answers: { qid: string; choice: string }[] }   // 6–8 answers
Resp: {
  pet: { id, name, archetype_key, stage:"egg" },
  archetype: { key, nameCN, vibe, coreNeed },
  reveal: {
    name: string,                 // suggested 本命 name
    lines: string[],              // archetype-specific reveal copy, quoting back 1–2 answers
    quotedAnswers: string[]
  }
}
```
Server scores answers into `V=(attach,curio,express)` via `lib/quiz.ts`, picks the nearest archetype by **express-weighted distance**, applies the documented tiebreak chain (epsilon → loudest axis → wildcard question → `hash(userId)`). **One pet per user**: if a `pet` row already exists for the user → `409 {error:"already_bonded", pet}` (re-take is buried in client, never a re-roll button). On success, in one transaction: insert `quiz_result`, `pet` (stage egg, `created_at=now`), `pet_state` (egg defaults, caps 80), `pet_cooldown`, `pet_inventory` start kit (5 kibble / 2 snack / 2 soap / 20 heart), and the first reveal `voice_log` line. **Never returns scores/axes/percentages** — reveal is recognition, not calculation. The client `hatch` page delays the sprite a beat so name+line land first.

### GET `/api/pet`
```ts
Resp: {
  pet: { id, name, archetype_key, stage, days_known },
  state: { satiety, mood, cleanliness, energy, health, bond, exp,
           dominant_state, state_flags: string[], asleep },
  caps: { satiety, mood, … },          // stage caps
  voice: { line, line_id, intent },    // today's 心声 (created lazily if absent)
  actions: {                            // per verb: enabled + remaining cooldown ms + reason
    feed:{enabled,cooldown_ms,daily_left}, snack:{…}, clean:{…}, play:{…},
    pet:{…}, sleep:{…}, doctor:{…}, checkin:{…}
  },
  inventory: { kibble, snack, soap, heart },
  streak: { days, grace, next_milestone }
}
```
Flow: load `pet` + `pet_state` + `pet_cooldown` → **`recompute(pet, now_utc)`** (decay, cross-effects, `resolve_state_flags`, persist `last_tick=now`) → ensure today's `voice_log` exists (lazily select & insert one line, honoring the last-10 anti-repeat buffer) → compute per-action availability from cooldown table + stage-unlocked verbs + dominant state (e.g. `play` disabled while SULKING/SICK) → update `app_user.last_seen`. If no pet exists → `404 {error:"no_pet"}` (client routes to quiz).

### POST `/api/action`
```ts
Req:  { verb: "feed"|"snack"|"clean"|"play"|"pet"|"sleep"|"doctor"|"checkin" }
Resp(200): {
  ok: true,
  state: { …ticked, post-delta snapshot… },
  delta: { satiety?:+25, mood?:+8, exp?:+10, bond?:+3, … },
  line: { text, intent },              // personality-flavored reaction (eat/refuse/play/reunion/…)
  animation: string,                   // sprite cue: "eat_happy" | "refuse_pout" | "sulk" | …
  rewards?: { items?:{...}, hearts?:number }   // checkin gift roll
}
Resp(429): { ok:false, error:"cooldown", verb, remaining_ms }
Resp(409): { ok:false, error:"unavailable", reason:"sulking"|"sick"|"locked_stage"|"out_of_item" }
```
Server-authoritative pipeline (all in one DB transaction):
1. `recompute(pet, now)` — tick first.
2. **Cooldown gate** from `pet_cooldown` using server `now` (`if now - last_<verb> < cd → 429`). Daily caps: 6 feeds, 4 snacks, 20 抚摸; `*_count_day` reset when `daily_reset_on != user_local_today`.
3. **State/stage gate** (`409`): `play` blocked while SULKING/SICK; `snack` refused while SICK; `feed`/`clean`/`pet`/`doctor` **always allowed** (recovery never blocked); verb must be unlocked for current `stage`.
4. **Inventory gate** (`409 out_of_item`) for kibble/snack/soap/heart; decrement.
5. **Apply clamped delta** per the §6 verb table, with **archetype decay/preference multipliers** from `bestiary.ts` (loved food → bonus affection + special line/anim; disliked → refusal pout). Diminishing returns (overfeed >80 → +8, mood −2). All gains `clamp(…, cap_for_stage)`.
6. `resolve_state_flags` → re-derive dominant state; `checkin` advances streak (1-day grace, never zero, soft-reset to `floor/2`) and rolls the daily gift.
7. `select_copy(context)` → reaction `line` (+ `voice_log`/`action_log` rows); set `last_<verb>=now`; persist.
8. **Growth check**: if `exp ≥ next.exp_req AND days_since(created_at) ≥ next.min_days AND bond ≥ next.bond_gate` → promote (swap sprite, raise caps, unlock verbs, queue 成长 line + push if opted in).

### GET `/api/pet/diary`
```ts
Query: ?limit=30 (max 90)
Resp: {
  voices: { local_date, line, created_at }[],          // daily 心声 history
  actions: { verb, line, delta, created_at }[]          // recent interactions
}
```
Light recompute (so `last_seen`/streak surface correctly), then reads `voice_log` + `action_log` for the pet, newest first.

### POST `/api/subscribe`
```ts
Req:  { template_id: string }      // the WeChat 订阅消息 template the user just authorized
Resp: { ok: true }
```
Inserts one `sub_grant` (consumed=false) and sets `app_user.sub_opt_in=true`. Each client `wx.requestSubscribeMessage` tap = exactly one future push; the nightly cron consumes at most one. Platform per-message consent structurally caps frequency — impossible to spam.

---

## 4. Where Copy & Personality Data Live

**Decision: server resolves the line and returns finished text.** The copy bank, stat rules, and bestiary configs live **only in the backend** (`web/src/data/`), versioned in the repo. The client never ships the copy pack and never branches on personality — it renders `voice.line` / `action.line` strings and an `animation` cue string.

**Why server-resolve, not ship-a-pack** (for this product):
- **Determinism + anti-repeat live where the data is.** `select_copy(context)` needs the last-10 `voice_log` ring buffer and the full `(stage, mood, time_of_day, weather, streak_tier, recent_action, days_known)` context — all server-side. Shipping the pack would force duplicating that selection logic + state into the client.
- **The copy bank is the 灵气** (per the locked product decision) and changes most often. Server-side data means designers retune one `data/copybank/*.ts` file and `docker compose up -d --build` — no mini-program re-submission/review cycle per copy tweak. (Mirrors quit-diary keeping all logic server-side; the client is intentionally thin.)
- **Thin, reviewable client.** WeChat review is simpler when the client has no game logic, no personality tables, no creature-specific branching — just rendering.
- **Tractable bundle.** Pixel sprites are tiny and DO ship in `miniprogram/assets/sprites/`; the text copy bank stays server-side.

**Server data modules** (pure data, no external calls):
- `data/bestiary.ts` — keyed by `archetypeKey`: numeric axis targets (for matching), derived **decay multipliers** + **voice-register id**, food `loved/neutral/disliked` tags, preferred activities, idle/neglect animation set. One lookup row per creature so a designer retunes without touching code.
- `data/copybank/<archetype>.ts` — **authored archetype-first** (each creature written as a full character/voice), each line tagged `{intent, stage[], mood[], tod[], weather[], streak[], event}` with a stable `line_id`. `select_copy()` filters by context, excludes the last-10 ids, picks deterministically (seeded by `pet_id + local_date` for the daily 心声; random-within-eligible for reactions).
- `data/quiz-questions.ts`, `data/stage-table.ts` — questions+weights, stage gates/caps/unlocks.

`lib/copy.ts` (`select_copy`), `lib/tick.ts` (`recompute`), `lib/actions.ts` (`apply_action`), `lib/quiz.ts`, `lib/stages.ts` are the only code; everything personality lives as data under `data/`. This is the "three pure functions + a copy selector" runtime from the spec.

---

## 5. Client (miniprogram, native TS)

`app.ts` → `onLaunch` → `ensureUserId()` (verbatim quit-diary: `wx.login` → `POST /api/login` → store `user_id`). `utils/api.ts` is the quit-diary wrapper with `BASE_URL = "https://ai-native.japaneast.cloudapp.azure.com/cloudpet/api"` and `X-User-Id` header from storage.

**First-run gate:** on `home` load, `GET /api/pet`; `404 no_pet` → `wx.redirectTo` quiz.

**Pages** (`app.json` declares pages + a 4-tab `tabBar`; `quiz`/`hatch` are non-tab, first-run only):

| Page | Role |
|---|---|
| `quiz` | 6–8 cute scenario questions; collects `answers`, `POST /api/quiz`. Onboarding only. |
| `hatch` | Egg-hatch reveal: plays name + first personality line, **delays sprite a beat** (bond to personality before seeing the creature), then routes to `home`. |
| `home` (tab 主页) | The 宠物主页: sprite (current stage + dominant-mood frame), 5 stat bars + bond/exp, today's 心声 card, action buttons. Each tap → `POST /api/action`, animates per returned `animation`, re-renders returned `state`. Disabled buttons show remaining cooldown from `actions.*.cooldown_ms`. |
| `diary` (tab 心声) | `GET /api/pet/diary` → 心声 + interaction timeline; lines are screenshot-friendly cards. |
| `codex` (tab 图鉴) | The 10 archetypes; user's bonded one unlocked + framed as 本命, others silhouetted. Pure local render from a small static list (cosmetic, no personality logic). |
| `me` (tab 我的) | streak, inventory, 订阅消息 opt-in (`wx.requestSubscribeMessage` → `POST /api/subscribe`), buried re-take entry. |

**Sprite rendering — keep it native & light:**
- **Per-stage PNG frames, not a packed atlas.** Each `assets/sprites/<archetypeKey>/` holds a handful of small pixel PNGs: one per `(stage × moodVariant)` plus 2–4 idle frames. Pixel art is tiny (KB each); WeChat handles `<image>` with `image-rendering: pixelated` cleanly.
- **Idle animation = swap `<image src>` on a `setInterval` in the page `.ts`** (e.g. 2–4 frames at ~500ms), or a CSS step-animation in `.wxss` over a horizontal strip when frames are uniform. **No canvas needed** for V1 — `<image>` + frame-swap is the lightest native approach and avoids the canvas lifecycle cost. (Reserve `canvas` only if a future stage needs particle effects.)
- The server tells the client **which mood/animation** to show via `state.dominant_state` (idle frame set) and `action.animation` (one-shot cue like `eat_happy`, `refuse_pout`, `sulk`, `hide`, `reunion`); the client maps that string → local PNG. No personality logic on the client.

---

## 6. Docker + nginx + Port 3012

**`docker-compose.yml`** (quit-diary's, with `cloudpet`/`3012` substituted):
```yaml
services:
  web:
    build: ./web
    image: cloudpet-web
    restart: unless-stopped
    env_file: .env
    environment:
      PG_HOST: db
      PG_PORT: "5432"
      PG_USER: cloudpet
      PG_DB: cloudpet
    ports:
      - "127.0.0.1:3012:3000"      # PORT 3012 reserved for this project

networks:
  default:
    name: traffic-monitor_default   # external bridge → resolves shared `db` container
    external: true
```
`web/next.config.js`: `{ basePath: "/cloudpet", output: "standalone" }`. `web/lib/db.ts`: copy quit-diary's, defaulting `PG_USER`/`PG_DB` to `cloudpet`. Dockerfile copied verbatim. `.env` (gitignored) holds `PG_PASSWORD`, `WX_APP_ID`, `WX_APP_SECRET`, `NEXT_PUBLIC_UMAMI_*` (same shape as quit-diary `.env.example`).

**nginx** — `/etc/nginx/snippets/cloudpet.conf` (mirror quit-diary's snippet exactly):
```nginx
location /cloudpet {
    proxy_pass http://127.0.0.1:3012;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
Then `include snippets/cloudpet.conf;` in `/etc/nginx/sites-enabled/personal-site` → `sudo nginx -t && sudo nginx -s reload`.

**Bootstrap:** `db/bootstrap.sh` = quit-diary's with `quit_diary`→`cloudpet` and env at `~/.config/cloudpet.env` (`CLOUDPET_PG_PASSWORD`, mode 600), connecting as the **`umami`** superuser (not `postgres`) to create the `cloudpet` role + DB, then applying `schema.sql`.

---

## 7. Cron — needed, minimal

A **nightly tick cron is needed** (not for correctness — compute-on-read is fully authoritative — but for 订阅消息 pushes + the /status heartbeat). Without it the game is still 100% correct; it just loses reminder pushes and dashboard freshness.

**Job** (one entry, batched by tz bucket; runs ~user-local 20:00, e.g. 12:00 UTC for UTC+8):
```cron
0 12 * * *  cd /home/liharr/src/cloudpet && /usr/bin/node web/scripts/nightly-tick.js >> /home/liharr/src/cloudpet/cron.log 2>&1 && touch /home/liharr/.local/share/cron-heartbeats/cloudpet-tick
```
`nightly-tick.js` (best-effort, idempotent): for each pet, `recompute()` (cosmetic pre-warm); for opted-in users with `now - last_seen > 20h` AND a genuinely low/declining stat OR a pending stage-up OR a streak grace-day, consume **one** unconsumed `sub_grant` and send **one** warm, pet-voiced 订阅消息 (never "你的宠物快死了!"). At most one push per user per ~24–36h. No Claude/Foundry call → **cost logging step is correctly skipped** (N/A).

**The 6-step wiring** (cost logging skipped per the pure-rule-based nature):
1. **nginx** — `snippets/cloudpet.conf` above, included in `personal-site`.
2. **site-index** — add a nav `<a class="item">` for 云宠物 → `/cloudpet` in `/home/liharr/src/site-index/index.html`; push to `WhatsFish/site-index`.
3. **/status group** — add `cloudpetHttp` HTTP probe in `status/web/src/lib/checks/http.ts`; add `DbName "cloudpet"` + `CLOUDPET_PG_*` in `status/web/src/lib/pg.ts`; add a freshness check `status/web/src/lib/checks/cloudpet.ts` (mirror `quit-diary.ts`: assert `app_user, pet, pet_state, action_log` tables present as the `cloudpet` role) + register both in `checks/index.ts`; add `"cloudpet"` to `GROUP_ORDER` and `GROUP_LABEL` in `status/web/src/app/page.tsx`; append `CLOUDPET_PG_*` to `status/.env`; register the cron in `checks/cron.ts` `JOBS` (id `cloudpet-tick`, daily, `warnAfterMs: 28*H`, `failAfterMs: 48*H` — weekend-tolerant); rebuild status web.
4. **cron heartbeat** — the entry ends with `&& touch /home/liharr/.local/share/cron-heartbeats/cloudpet-tick`.
5. **cost logging** — **SKIP** (no Claude/Foundry; pure rule-based).
6. **Umami** — `layout.tsx` adds the script via `next/script`, gated on `NEXT_PUBLIC_UMAMI_SRC` + `NEXT_PUBLIC_UMAMI_WEBSITE_ID` (operator creates the website first to get the id).

---

### Reference files mirrored (absolute paths)
- Schema/bootstrap/compose/env templates: `/home/liharr/src/quit-diary/db/schema.sql`, `/home/liharr/src/quit-diary/db/bootstrap.sh`, `/home/liharr/src/quit-diary/docker-compose.yml`, `/home/liharr/src/quit-diary/.env.example`
- Backend libs/routes copied verbatim: `/home/liharr/src/quit-diary/web/src/lib/{db,auth,wechat}.ts`, `/home/liharr/src/quit-diary/web/src/app/api/login/route.ts`, `/home/liharr/src/quit-diary/web/next.config.js`, `/home/liharr/src/quit-diary/web/Dockerfile`
- Client patterns copied: `/home/liharr/src/quit-diary/miniprogram/utils/{api,auth}.ts`, `/home/liharr/src/quit-diary/miniprogram/app.{json,ts}`
- /status wiring exemplars: `/home/liharr/src/status/web/src/lib/checks/quit-diary.ts`, `/home/liharr/src/status/web/src/lib/checks/{cron,http,index}.ts`, `/home/liharr/src/status/web/src/lib/pg.ts`, `/home/liharr/src/status/web/src/app/page.tsx`
- nginx exemplar: `/etc/nginx/snippets/quit-diary.conf` (included from `/etc/nginx/sites-enabled/personal-site`)
