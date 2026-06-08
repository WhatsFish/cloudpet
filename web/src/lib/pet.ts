// Service layer (V2): load rows, run the compute-on-read tick + battery, and build
// the view models + copy context. Shared by GET /api/pet and POST /api/action.

import type { Tx } from "@/lib/db";
import { query } from "@/lib/db";
import type { ActionAvailability, CareCounts, CareTimer, CopyContext, NeedKind, PetRow, PetView, Recap, Roadmap, Snapshot, Stage, Verb } from "@/lib/types";
import { creature } from "@/data/bestiary";
import { capForStage, effectiveMinDays, expForNextStage, nextStage, pendingTeenFork } from "@/data/stage-table";
import {
  ACTIONS, CARE_COVERED_AT, NIGHT_FROM, NIGHT_TO, SLEEPY_ENERGY,
  DECAY, M_STAGE, NEED_THRESH, SPARK_MAX, SPARK_REGEN_MS,
  WEIGHT_START, WEIGHT_SIZE_RANGE, WEIGHT_SIZE_SPAN,
} from "@/lib/game/constants";
import { recompute } from "@/lib/game/tick";
import { forkOptions, speciesName } from "@/lib/game/evolve";
import { deriveNeeds, passiveRatePerHour, VERB_NEED, type NeedTimes } from "@/lib/game/needs";
import { expToReach, levelFromExp, levelProgress } from "@/lib/game/levels";
import { badges, dominant, moodBand } from "@/lib/game/state";
import { STATE } from "@/lib/types";
import { daysBetween, localDateStr, localHour, timeBand } from "@/lib/game/time";
import type { CooldownRow } from "@/lib/game/actions";

const STAGE_CN: Record<Stage, string> = { egg: "蛋", baby: "幼年", child: "童年", teen: "少年", adult: "成年" };

export type Rows = {
  pet: PetRow;
  state: Snapshot;
  cooldown: CooldownRow;
  lastActionMs: number;
  care: CareCounts; // V3: persisted care-history aggregates (pet_state)
  needTimes: NeedTimes; // V4: last-satisfied timestamps per need (cooldown anchors)
  tapsToday: number; // V4: pet-bond soft-cap counter
  tapsDay: string | null; // local date the tapsToday counter belongs to
  sparks: number; // V8: banked 灵感火花 (tap-for-EXP)
  sparksAt: number | null; // V8: spark-regen anchor (ms)
};

const PET_COLS = "id, user_id, archetype_key, species_id, name, stage, created_at::text AS created_at";
const STATE_COLS =
  "satiety, mood, cleanliness, energy, health, bond, exp::int AS exp, weight, " +
  "last_tick::text AS last_tick, state_flags, state_since::text AS state_since, " +
  "asleep, sleep_since::text AS sleep_since, " +
  "care_feed, care_clean, care_doctor, affection_taps, " +
  "need_fed_at::text, need_clean_at::text, need_bored_at::text, need_unwell_at::text, need_wants_at::text, " +
  "pet_taps_today, taps_day::text, sparks, sparks_at::text";
const CD_COLS =
  "daily_reset_on::text AS daily_reset_on, streak_days, streak_state, " +
  "last_active_date::text AS last_active_date, care_charges, charges_updated_at::text AS charges_updated_at";

export async function loadRows(q: Tx, userId: string, forUpdate = false): Promise<Rows | null> {
  const lock = forUpdate ? " FOR UPDATE" : "";
  const pets = await q<PetRow>(`SELECT ${PET_COLS} FROM pet WHERE user_id = $1`, [userId]);
  const pet = pets[0];
  if (!pet) return null;

  type StateRow = Snapshot & {
    care_feed: number; care_clean: number; care_doctor: number; affection_taps: number;
    need_fed_at: string | null; need_clean_at: string | null; need_bored_at: string | null;
    need_unwell_at: string | null; need_wants_at: string | null;
    pet_taps_today: number; taps_day: string | null;
    sparks: number; sparks_at: string | null;
  };
  const states = await q<StateRow>(`SELECT ${STATE_COLS} FROM pet_state WHERE pet_id = $1${lock}`, [pet.id]);
  const cds = await q<CooldownRow>(`SELECT ${CD_COLS} FROM pet_cooldown WHERE pet_id = $1${lock}`, [pet.id]);
  const la = await q<{ m: string | null }>(`SELECT max(created_at)::text AS m FROM action_log WHERE pet_id = $1`, [pet.id]);
  const lastActionMs = la[0]?.m ? Date.parse(la[0].m) : 0;

  const st = states[0];
  const care: CareCounts = { feed: st.care_feed, clean: st.care_clean, doctor: st.care_doctor, affection: st.affection_taps };
  const ms = (v: string | null) => (v ? Date.parse(v) : null);
  // need_wants_at is repurposed in V5 as "last slept at" (sleepy cooldown anchor).
  const needTimes: NeedTimes = { fed: ms(st.need_fed_at), clean: ms(st.need_clean_at), bored: ms(st.need_bored_at), unwell: ms(st.need_unwell_at), slept: ms(st.need_wants_at) };
  return { pet, state: st, cooldown: cds[0], lastActionMs, care, needTimes, tapsToday: st.pet_taps_today, tapsDay: st.taps_day, sparks: st.sparks, sparksAt: ms(st.sparks_at) };
}

export function lastInteractionMs(rows: Rows): number {
  return Math.max(rows.lastActionMs, Date.parse(rows.pet.created_at));
}

// 灵感火花 regen: +1 per SPARK_REGEN_MS since the anchor, capped at SPARK_MAX (compute-on-read,
// so it accrues offline AND while the app stays open). Returns the new count + advanced anchor.
export function regenSparks(sparks: number, sparksAt: number | null, nowMs: number): { sparks: number; sparksAt: number } {
  if (sparks >= SPARK_MAX) return { sparks: SPARK_MAX, sparksAt: nowMs };
  const anchor = sparksAt ?? nowMs; // first read just sets the anchor
  const gained = Math.floor((nowMs - anchor) / SPARK_REGEN_MS);
  if (gained <= 0) return { sparks, sparksAt: anchor };
  const ns = Math.min(SPARK_MAX, sparks + gained);
  return { sparks: ns, sparksAt: ns >= SPARK_MAX ? nowMs : anchor + gained * SPARK_REGEN_MS };
}

export async function tickAndPersistTz(
  q: Tx, rows: Rows, nowMs: number, tzOffsetMin: number,
): Promise<{ rows: Rows; promoted: Stage | null }> {
  const out = recompute({
    s: rows.state,
    stage: rows.pet.stage,
    createdAtMs: Date.parse(rows.pet.created_at),
    tzOffsetMin,
    lastInteractionMs: lastInteractionMs(rows),
    creature: creature(rows.pet.species_id),
    nowMs,
    seedArchetype: rows.pet.archetype_key,
    care: rows.care,
  });
  const sp = regenSparks(rows.sparks, rows.sparksAt, nowMs);
  await q(
    `UPDATE pet_state SET satiety=$2, mood=$3, cleanliness=$4, energy=$5, health=$6,
       bond=$7, exp=$8, weight=$9, last_tick=$10, state_flags=$11, state_since=$12, asleep=$13,
       sleep_since=$14, sparks=$15, sparks_at=$16, updated_at=NOW() WHERE pet_id=$1`,
    [rows.pet.id, out.s.satiety, out.s.mood, out.s.cleanliness, out.s.energy, out.s.health,
     out.s.bond, out.s.exp, out.s.weight, out.s.last_tick, out.s.state_flags, out.s.state_since, out.s.asleep, out.s.sleep_since,
     sp.sparks, new Date(sp.sparksAt).toISOString()],
  );
  if (out.promoted) await q(`UPDATE pet SET stage=$2 WHERE id=$1`, [rows.pet.id, out.stage]);
  // The child→teen fork (which diverges species_id) is a deliberate player choice handled by
  // POST /api/pet/evolve, never the passive tick — so species_id is untouched here.
  return { rows: { ...rows, pet: { ...rows.pet, stage: out.stage }, state: out.s, sparks: sp.sparks, sparksAt: sp.sparksAt }, promoted: out.promoted };
}

export function behaviorPattern(streakDays: number, noInteractionH: number, band: string): string[] {
  const p: string[] = [];
  if (streakDays >= 5) p.push("daily_regular");
  if (noInteractionH > 24) p.push("neglected_recently");
  if (band === "深夜") p.push("night_owl");
  return p;
}

export function buildContext(rows: Rows, nowMs: number, tzOffsetMin: number): CopyContext {
  const { pet, state, cooldown } = rows;
  const band = timeBand(nowMs, tzOffsetMin);
  const dom = dominant(state, state.asleep);
  const daysKnown = Math.max(1, Math.floor(daysBetween(Date.parse(pet.created_at), nowMs)) + 1);
  const noInteractionH = Math.max(0, (nowMs - lastInteractionMs(rows)) / 3600000);
  const localDate = localDateStr(nowMs, tzOffsetMin);
  let seed = 2166136261 >>> 0;
  for (const ch of `${pet.id}|${localDate}`) { seed ^= ch.charCodeAt(0); seed = Math.imul(seed, 16777619); }
  return {
    stage: pet.stage,
    moodBand: moodBand(state.mood),
    timeBand: band,
    dominantState: dom.stateName,
    stateFlags: state.state_flags,
    streakDays: cooldown.streak_days,
    bond: state.bond,
    daysKnown,
    pattern: behaviorPattern(cooldown.streak_days, noInteractionH, band),
    need: deriveNeeds(state, rows.needTimes, nowMs, tzOffsetMin, state.asleep)[0]?.kind ?? null,
    seed: seed >>> 0,
  };
}

export function careCoveredToday(s: Snapshot): boolean {
  return s.satiety >= CARE_COVERED_AT && s.cleanliness >= CARE_COVERED_AT && s.health >= CARE_COVERED_AT;
}

export function needHint(s: Snapshot, covered: boolean): string {
  if (covered) return "今天照顾好啦 ✓ 明天见～";
  const cands: [number, string][] = [
    [s.satiety, "它有点饿了，喂一口吧 🍙"],
    [s.cleanliness, "身上有点脏脏的，洗个澡吧 🛁"],
    [s.health, "它今天有点蔫，看看医生就好啦 💊"],
  ];
  const low = cands.filter((c) => c[0] < CARE_COVERED_AT).sort((a, b) => a[0] - b[0]);
  return low.length ? low[0][1] : "来照顾它一下，今天就长大一点点 🌱";
}

export function actionAvailability(stage: Stage, s: Snapshot, dueKinds: NeedKind[], hour: number): ActionAvailability[] {
  const order = ({ egg: 0, baby: 1, child: 2, teen: 3, adult: 4 } as Record<Stage, number>)[stage];
  const asleep = s.asleep;
  const night = hour >= NIGHT_FROM || hour < NIGHT_TO;
  const sick = (s.state_flags & STATE.SICK) !== 0;
  const out: ActionAvailability[] = [];
  for (const verb of Object.keys(ACTIONS) as Verb[]) {
    const def = ACTIONS[verb];
    let enabled = true; let reason: string | undefined;
    if (order < def.unlockOrder) { enabled = false; reason = "locked"; }
    else if (asleep) {
      // asleep: gentle 摸摸 / 叫醒 always; a DUE care need can gently wake the pet to be cared
      // for; everything else waits until it wakes.
      const kind = def.charge ? VERB_NEED[verb] : undefined;
      const careDue = !!kind && dueKinds.includes(kind);
      if (verb !== "pet" && verb !== "sleep" && !careDue) { enabled = false; reason = "asleep"; }
    } else if (verb === "sleep") {
      if (!night && s.energy >= SLEEPY_ENERGY) { enabled = false; reason = "not_sleepy"; }
    } else if (def.charge) {
      // care is gated on its NEED being due (the rhythm limit)
      const kind = VERB_NEED[verb];
      if (!kind || !dueKinds.includes(kind)) { enabled = false; reason = "not_needed"; }
    } else if (verb === "play" && sick) { enabled = false; reason = "sick"; }
    out.push({ verb, enabled, reason });
  }
  return out;
}

// V4 roadmap: next level + next stage gate (with the binding piece) so the player is
// never in the dark about why to come back.
export function buildRoadmap(rows: Rows, nowMs: number): Roadmap {
  const { state, pet } = rows;
  const lvl = levelFromExp(state.exp);
  const lo = expToReach(lvl), hi = expToReach(lvl + 1);
  const level = { level: lvl, expInto: state.exp - lo, expSpan: Math.max(1, hi - lo), expRemaining: Math.max(0, hi - state.exp) };

  const nxt = nextStage(pet.stage);
  if (!nxt) return { level, stage: null, line: "已经长成少年啦，还在一天天和你变熟（成年形态待开放）" };

  const days = daysBetween(Date.parse(pet.created_at), nowMs);
  const expRemaining = Math.max(0, nxt.expReq - state.exp);
  const daysRemaining = Math.max(0, Math.ceil(effectiveMinDays(nxt.minDays, state.bond) - days));
  const bondRemaining = Math.max(0, nxt.bondGate - state.bond);
  const unmet: ("exp" | "days" | "bond")[] = [];
  if (expRemaining > 0) unmet.push("exp");
  if (daysRemaining > 0) unmet.push("days");
  if (bondRemaining > 0) unmet.push("bond");
  const dailyEst = passiveRatePerHour(state, capForStage(pet.stage)) * 24 + 120; // passive + nominal active
  const etaDays = Math.max(daysRemaining, Math.ceil(expRemaining / Math.max(1, dailyEst)));
  const toTeen = nxt.stage === "teen";
  const towardName = toTeen ? "由你选择的样子" : speciesName(pet.archetype_key);
  const stage = { stage: nxt.stage, towardName, expReq: nxt.expReq, minDays: nxt.minDays, bondGate: nxt.bondGate, expRemaining, daysRemaining, bondRemaining, unmet, etaDays };

  const parts: string[] = [];
  if (daysRemaining > 0) parts.push(`再 ${daysRemaining} 天`);
  if (bondRemaining > 0) parts.push(`亲密度还差 ${bondRemaining}`);
  if (expRemaining > 0 && daysRemaining === 0) parts.push(`经验还差 ${expRemaining}`);
  const cond = parts.length ? parts.join("、") : "马上就";
  const line = `${cond} → ${toTeen ? "长大成少年，样子由你来选" : `长大到${STAGE_CN[nxt.stage]}`}`;
  return { level, stage, line };
}

// V8.2 倒计时: needs are stat-driven, so the "countdown" is a real estimate of when the stat
// will decay below its threshold — feed → when it gets hungry, clean → when it gets dirty,
// doctor → only when sick. Gives the home a "what & roughly when" readout so a visit is never
// just 陪玩/摸摸. (Estimate ignores the bond/random-dip jitter — it's an "约X后" hint.)
export function buildCareTimers(s: Snapshot, stage: Stage, dueKinds: NeedKind[]): CareTimer[] {
  const mStage = M_STAGE[stage];
  const fmt = (sec: number) => (sec < 3600 ? Math.max(1, Math.round(sec / 60)) + "分钟" : Math.round(sec / 3600) + "小时");
  const eta = (stat: number, thresh: number, ratePerHour: number) => Math.max(0, Math.round(((stat - thresh) / Math.max(0.1, ratePerHour)) * 3600));

  const feedDue = dueKinds.includes("hungry"), cleanDue = dueKinds.includes("dirty"), docDue = dueKinds.includes("unwell");
  const feedEta = feedDue ? null : eta(s.satiety, NEED_THRESH.hungry, DECAY.satiety * mStage);
  const cleanEta = cleanDue ? null : eta(s.cleanliness, NEED_THRESH.dirty, DECAY.cleanliness * mStage);
  return [
    { verb: "feed", due: feedDue, etaSec: feedEta, label: feedDue ? "现在该喂啦" : `约${fmt(feedEta!)}后会饿` },
    { verb: "clean", due: cleanDue, etaSec: cleanEta, label: cleanDue ? "该洗澡啦" : `约${fmt(cleanEta!)}后会脏` },
    { verb: "doctor", due: docDue, etaSec: null, label: docDue ? "该看医生啦" : "健健康康" },
  ];
}

export type ViewOpts = {
  nowMs: number;
  tz: number;
  theme: string;
  voice: { line: string; lineId: string } | null;
  recap: Recap | null;
  needLine?: (kind: NeedKind) => string; // persona voice for the need card
};

export function buildPetView(rows: Rows, o: ViewOpts): PetView {
  const { pet, state, cooldown } = rows;
  const dom = dominant(state, state.asleep);
  const daysKnown = Math.max(1, Math.floor(daysBetween(Date.parse(pet.created_at), o.nowMs)) + 1);
  const days = daysBetween(Date.parse(pet.created_at), o.nowMs);
  const level = levelFromExp(state.exp);
  const hour = localHour(o.nowMs, o.tz);
  const needs = deriveNeeds(state, rows.needTimes, o.nowMs, o.tz, state.asleep);
  if (o.needLine) for (const n of needs) n.label = o.needLine(n.kind) || n.label; // persona voice

  return {
    pet: { id: pet.id, name: pet.name, archetypeKey: pet.archetype_key, stage: pet.stage, daysKnown, level },
    stats: { satiety: state.satiety, mood: state.mood, cleanliness: state.cleanliness, energy: state.energy, health: state.health },
    bond: state.bond,
    exp: state.exp,
    level,
    evolveProgress: levelProgress(state.exp),
    expForNextStage: expForNextStage(pet.stage),
    moodBand: moodBand(state.mood),
    dominantState: dom.stateName,
    badges: badges(state, state.asleep),
    needHint: needs[0]?.label ?? "它现在很满足，陪它待一会儿就好～",
    asleep: state.asleep,
    sprite: { creatureId: pet.species_id, stage: pet.stage, mood: dom.spriteMood, animation: dom.animation },
    needs,
    topNeed: needs[0] ?? null,
    asleepNow: state.asleep,
    roadmap: buildRoadmap(rows, o.nowMs),
    recap: o.recap,
    growthPerDay: Math.round(passiveRatePerHour(state, capForStage(pet.stage)) * 24),
    weight: state.weight,
    sizeScale: WEIGHT_SIZE_RANGE[0] + (WEIGHT_SIZE_RANGE[1] - WEIGHT_SIZE_RANGE[0]) * Math.max(0, Math.min(1, (state.weight - WEIGHT_START) / WEIGHT_SIZE_SPAN)),
    sparks: rows.sparks,
    sparkEtaSec: rows.sparks >= SPARK_MAX ? 0 : Math.max(0, Math.round((SPARK_REGEN_MS - (o.nowMs - (rows.sparksAt ?? o.nowMs))) / 1000)),
    careTimers: buildCareTimers(state, pet.stage, needs.map((n) => n.kind)),
    bondHearts: Math.min(5, Math.round(state.bond / 200)),
    streakDays: cooldown.streak_days,
    theme: o.theme,
    voice: o.voice,
    actions: actionAvailability(pet.stage, state, needs.map((n) => n.kind), hour),
    fork: {
      pending: pendingTeenFork(pet.stage, state.exp, state.bond, days),
      options: forkOptions(pet.archetype_key),
    },
  };
}

export async function ensureDailyVoice(
  rows: Rows, ctx: CopyContext, localDate: string,
  build: () => { text: string; lineId: string },
): Promise<{ line: string; lineId: string }> {
  const existing = await query<{ line: string; line_id: string }>(
    `SELECT line, line_id FROM voice_log WHERE pet_id=$1 AND local_date=$2`, [rows.pet.id, localDate],
  );
  if (existing[0]) return { line: existing[0].line, lineId: existing[0].line_id };
  const built = build();
  await query(
    `INSERT INTO voice_log (pet_id, local_date, line, line_id, context)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (pet_id, local_date) DO NOTHING`,
    [rows.pet.id, localDate, built.text, built.lineId, JSON.stringify({ streak: ctx.streakDays })],
  );
  const again = await query<{ line: string; line_id: string }>(
    `SELECT line, line_id FROM voice_log WHERE pet_id=$1 AND local_date=$2`, [rows.pet.id, localDate],
  );
  return again[0] ? { line: again[0].line, lineId: again[0].line_id } : { line: built.text, lineId: built.lineId };
}
