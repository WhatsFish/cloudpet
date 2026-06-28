-- cloudpet schema. Idempotent (safe to re-run). Applied by db/bootstrap.sh as the
-- cloudpet role. One bonded pet per user (UNIQUE(user_id)); (pet_state.snapshot,
-- last_tick) is the whole authoritative state — everything else is compute-on-read.

CREATE TABLE IF NOT EXISTS app_user (
  user_id           TEXT PRIMARY KEY,                       -- openid, or anon-<uuid>
  is_anonymous      BOOLEAN NOT NULL DEFAULT FALSE,
  tz_offset_minutes INTEGER NOT NULL DEFAULT 480,           -- SERVER-VALIDATED at login
  sub_opt_in        BOOLEAN NOT NULL DEFAULT FALSE,
  theme             TEXT NOT NULL DEFAULT 'cream',           -- device skin (cream|mint|dusk)
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
  -- B3: live stats are DOUBLE PRECISION (not INTEGER) so the compute-on-read tick's sub-unit
  -- residual survives FREQUENT reads — rounding it away on every read froze BOTH decay and growth.
  -- Rounded only at the view layer (buildPetView). CHECK ranges still hold for floats.
  satiety     DOUBLE PRECISION NOT NULL DEFAULT 70 CHECK (satiety     BETWEEN 0 AND 100),
  mood        DOUBLE PRECISION NOT NULL DEFAULT 60 CHECK (mood        BETWEEN 0 AND 100),
  cleanliness DOUBLE PRECISION NOT NULL DEFAULT 80 CHECK (cleanliness BETWEEN 0 AND 100),
  energy      DOUBLE PRECISION NOT NULL DEFAULT 80 CHECK (energy      BETWEEN 0 AND 100),
  health      DOUBLE PRECISION NOT NULL DEFAULT 80 CHECK (health      BETWEEN 0 AND 100),  -- 80 == egg cap
  bond        DOUBLE PRECISION NOT NULL DEFAULT 300 CHECK (bond BETWEEN 0 AND 1000),  -- INITIAL_BOND: newborn hatches at ~2 hearts
  exp         DOUBLE PRECISION NOT NULL DEFAULT 0  CHECK (exp >= 0),
  last_tick   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  state_flags INTEGER NOT NULL DEFAULT 0,                    -- SICK=1 SULKING=2 HIDING=4 LONELY=8
  state_since TIMESTAMPTZ,
  asleep      BOOLEAN NOT NULL DEFAULT FALSE,
  sleep_since TIMESTAMPTZ,
  -- V3 养育历史 (Model C): which care you favour steers the divergent teen fork.
  -- affection_taps = play + pet (the free actions). See lib/game/evolve.ts.
  care_feed      INTEGER NOT NULL DEFAULT 0,
  care_clean     INTEGER NOT NULL DEFAULT 0,
  care_doctor    INTEGER NOT NULL DEFAULT 0,
  affection_taps INTEGER NOT NULL DEFAULT 0,
  -- V4 needs loop (replaces 照顾电池): last time each need was satisfied (cooldown anchor).
  need_fed_at    TIMESTAMPTZ,
  need_clean_at  TIMESTAMPTZ,
  need_bored_at  TIMESTAMPTZ,
  need_unwell_at TIMESTAMPTZ,
  need_wants_at  TIMESTAMPTZ,
  pet_taps_today INTEGER NOT NULL DEFAULT 0,  -- pet-bond soft cap per local day
  taps_day       DATE,
  -- V8 体型: grows over real days + per feed up to a per-stage cap; drives display size.
  weight      DOUBLE PRECISION NOT NULL DEFAULT 100,
  -- V8 灵感火花: banked tap-for-EXP sparks (regen over time, compute-on-read off sparks_at).
  sparks      INTEGER NOT NULL DEFAULT 3,
  sparks_at   TIMESTAMPTZ,
  equipped_hat TEXT,                                   -- V8.8 可装饰: equipped head deco id (NULL = none)
  -- care_charges/charges_updated_at remain (dormant) — battery removed from read path in V4.
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- V4 away-then-grew recap source. One row per offline growth event; GET surfaces unseen.
CREATE TABLE IF NOT EXISTS growth_event (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pet_id      BIGINT NOT NULL REFERENCES pet(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                -- 'rest' | 'level' | 'stage' | 'evolve'
  level_from  INTEGER, level_to INTEGER,
  stage_from  TEXT, stage_to TEXT,
  evolved_to  TEXT,                         -- species_id, if it changed
  days_away   NUMERIC,
  exp_gained  INTEGER,
  local_date  DATE,
  seen        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_growth_unseen ON growth_event (pet_id, seen);

CREATE TABLE IF NOT EXISTS pet_cooldown (
  pet_id           BIGINT PRIMARY KEY REFERENCES pet(id) ON DELETE CASCADE,
  last_feed TIMESTAMPTZ, last_snack TIMESTAMPTZ, last_clean TIMESTAMPTZ,
  last_play TIMESTAMPTZ, last_pet TIMESTAMPTZ, last_sleep TIMESTAMPTZ,
  last_doctor TIMESTAMPTZ, last_checkin TIMESTAMPTZ, last_reunion_gift TIMESTAMPTZ,
  feed_count_day  INTEGER NOT NULL DEFAULT 0,
  snack_count_day INTEGER NOT NULL DEFAULT 0,
  pet_count_day   INTEGER NOT NULL DEFAULT 0,
  daily_reset_on  DATE,                                       -- user-local date the *_day counters belong to
  streak_days     INTEGER NOT NULL DEFAULT 0,
  streak_state    TEXT NOT NULL DEFAULT 'active'
                  CHECK (streak_state IN ('active','grace')),
  last_active_date DATE,
  care_charges       INTEGER NOT NULL DEFAULT 3,             -- V2 「照顾电池」: 3/day, +1/5h, midnight reset
  charges_updated_at TIMESTAMPTZ                             -- compute-on-read regen anchor
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_complete_per_day
  ON action_log (pet_id, local_date) WHERE verb = 'complete';  -- V2 「照顾够了」完成奖 idempotent

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

-- ─────────────────────────────────────────────────────────────────────────────
-- Forward migrations. CREATE TABLE IF NOT EXISTS above is a no-op on a DB that
-- predates a column, so every column added after a table first shipped must ALSO
-- be an idempotent ALTER here, or a fresh `bootstrap.sh` against an old DB drifts
-- from the code (loadRows would SELECT a column that doesn't exist → 500 on every
-- read). All ADD COLUMN IF NOT EXISTS / SET DEFAULT are no-ops on an up-to-date DB.
-- ─────────────────────────────────────────────────────────────────────────────

-- pet_state: V3 care history
ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS care_feed      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS care_clean     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS care_doctor    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS affection_taps INTEGER NOT NULL DEFAULT 0;
-- pet_state: V4 needs loop
ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS need_fed_at    TIMESTAMPTZ;
ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS need_clean_at  TIMESTAMPTZ;
ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS need_bored_at  TIMESTAMPTZ;
ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS need_unwell_at TIMESTAMPTZ;
ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS need_wants_at  TIMESTAMPTZ;
ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS pet_taps_today INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS taps_day       DATE;
-- pet_state: V8 体型 + 灵感火花
ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS weight    INTEGER NOT NULL DEFAULT 100;
ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS sparks    INTEGER NOT NULL DEFAULT 3;
ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS sparks_at TIMESTAMPTZ;
-- V8.8 可装饰: the equipped head decoration (deco catalog id), or NULL for bare-headed. Ownership
-- is compute-on-read (unlock conditions); only the equipped choice persists.
ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS equipped_hat TEXT;
-- pet_state: V2 §5 可装饰 multi-slot — a second cosmetic slot (光环 aura). Additive nullable, safe.
ALTER TABLE pet_state ADD COLUMN IF NOT EXISTS equipped_aura TEXT;
-- bond: newborns start warm (INITIAL_BOND ≈ 2 hearts) — retrofit the default for old DBs.
ALTER TABLE pet_state ALTER COLUMN bond SET DEFAULT 300;

-- pet_cooldown: V2 care battery (dormant) + V8.3 streak-milestone high-water mark.
ALTER TABLE pet_cooldown ADD COLUMN IF NOT EXISTS care_charges       INTEGER NOT NULL DEFAULT 3;
ALTER TABLE pet_cooldown ADD COLUMN IF NOT EXISTS charges_updated_at TIMESTAMPTZ;
-- max_streak_reached gates the day7/day30 EXP bonus to once-ever, so a halve-and-reclimb past
-- an already-passed milestone never re-grants. Backfill to the current streak so existing pets
-- that already passed a milestone don't get paid again on their next reclimb.
ALTER TABLE pet_cooldown ADD COLUMN IF NOT EXISTS max_streak_reached INTEGER NOT NULL DEFAULT 0;
UPDATE pet_cooldown SET max_streak_reached = streak_days WHERE max_streak_reached < streak_days;

-- B3 fix (2026-06-19): widen live stats INTEGER/BIGINT → DOUBLE PRECISION so the compute-on-read
-- tick keeps the sub-unit residual across frequent reads (rounding it away froze decay AND growth).
-- Idempotent: ALTERing an already-double column just rewrites a tiny table. Rounded at view layer.
ALTER TABLE pet_state
  ALTER COLUMN satiety     TYPE DOUBLE PRECISION,
  ALTER COLUMN mood        TYPE DOUBLE PRECISION,
  ALTER COLUMN cleanliness TYPE DOUBLE PRECISION,
  ALTER COLUMN energy      TYPE DOUBLE PRECISION,
  ALTER COLUMN health      TYPE DOUBLE PRECISION,
  ALTER COLUMN bond        TYPE DOUBLE PRECISION,
  ALTER COLUMN exp         TYPE DOUBLE PRECISION,
  ALTER COLUMN weight      TYPE DOUBLE PRECISION;
