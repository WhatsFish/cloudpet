// Service layer (V2): load rows, run the compute-on-read tick + battery, and build
// the view models + copy context. Shared by GET /api/pet and POST /api/action.

import type { Tx } from "@/lib/db";
import { query } from "@/lib/db";
import type { ActionAvailability, CopyContext, PetRow, PetView, Snapshot, Stage, Verb } from "@/lib/types";
import { creature } from "@/data/bestiary";
import { capForStage, expForNextStage } from "@/data/stage-table";
import { ACTIONS, CARE_COVERED_AT } from "@/lib/game/constants";
import { recompute } from "@/lib/game/tick";
import { levelFromExp, levelProgress } from "@/lib/game/levels";
import { badges, dominant, moodBand } from "@/lib/game/state";
import { STATE } from "@/lib/types";
import { daysBetween, localDateStr, timeBand } from "@/lib/game/time";
import type { CooldownRow } from "@/lib/game/actions";

export type Rows = {
  pet: PetRow;
  state: Snapshot;
  cooldown: CooldownRow;
  lastActionMs: number;
};

const PET_COLS = "id, user_id, archetype_key, species_id, name, stage, created_at::text AS created_at";
const STATE_COLS =
  "satiety, mood, cleanliness, energy, health, bond, exp::int AS exp, " +
  "last_tick::text AS last_tick, state_flags, state_since::text AS state_since, " +
  "asleep, sleep_since::text AS sleep_since";
const CD_COLS =
  "daily_reset_on::text AS daily_reset_on, streak_days, streak_state, " +
  "last_active_date::text AS last_active_date, care_charges, charges_updated_at::text AS charges_updated_at";

export async function loadRows(q: Tx, userId: string, forUpdate = false): Promise<Rows | null> {
  const lock = forUpdate ? " FOR UPDATE" : "";
  const pets = await q<PetRow>(`SELECT ${PET_COLS} FROM pet WHERE user_id = $1`, [userId]);
  const pet = pets[0];
  if (!pet) return null;

  const states = await q<Snapshot>(`SELECT ${STATE_COLS} FROM pet_state WHERE pet_id = $1${lock}`, [pet.id]);
  const cds = await q<CooldownRow>(`SELECT ${CD_COLS} FROM pet_cooldown WHERE pet_id = $1${lock}`, [pet.id]);
  const la = await q<{ m: string | null }>(`SELECT max(created_at)::text AS m FROM action_log WHERE pet_id = $1`, [pet.id]);
  const lastActionMs = la[0]?.m ? Date.parse(la[0].m) : 0;

  return { pet, state: states[0], cooldown: cds[0], lastActionMs };
}

export function lastInteractionMs(rows: Rows): number {
  return Math.max(rows.lastActionMs, Date.parse(rows.pet.created_at));
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
  });
  await q(
    `UPDATE pet_state SET satiety=$2, mood=$3, cleanliness=$4, energy=$5, health=$6,
       bond=$7, exp=$8, last_tick=$9, state_flags=$10, state_since=$11, asleep=$12,
       sleep_since=$13, updated_at=NOW() WHERE pet_id=$1`,
    [rows.pet.id, out.s.satiety, out.s.mood, out.s.cleanliness, out.s.energy, out.s.health,
     out.s.bond, out.s.exp, out.s.last_tick, out.s.state_flags, out.s.state_since, out.s.asleep, out.s.sleep_since],
  );
  if (out.promoted) await q(`UPDATE pet SET stage=$2 WHERE id=$1`, [rows.pet.id, out.stage]);
  return { rows: { ...rows, pet: { ...rows.pet, stage: out.stage }, state: out.s }, promoted: out.promoted };
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

export function actionAvailability(stage: Stage, s: Snapshot, charges: number, chargesRefreshInMs: number): ActionAvailability[] {
  const order = ({ egg: 0, baby: 1, child: 2, teen: 3, adult: 4 } as Record<Stage, number>)[stage];
  const out: ActionAvailability[] = [];
  for (const verb of Object.keys(ACTIONS) as Verb[]) {
    const def = ACTIONS[verb];
    let enabled = true; let reason: string | undefined; let remainingMs: number | undefined;
    if (order < def.unlockOrder) { enabled = false; reason = "locked"; }
    else if (def.blockedWhen?.includes("SICK") && s.state_flags & STATE.SICK) { enabled = false; reason = "sick"; }
    else if (def.charge && charges <= 0) { enabled = false; reason = "no_charge"; remainingMs = chargesRefreshInMs; }
    out.push({ verb, enabled, reason, remainingMs });
  }
  return out;
}

export type ViewOpts = {
  nowMs: number;
  charges: number;
  chargesRefreshInMs: number;
  dailyResetInMs: number;
  theme: string;
  voice: { line: string; lineId: string } | null;
};

export function buildPetView(rows: Rows, o: ViewOpts): PetView {
  const { pet, state, cooldown } = rows;
  const dom = dominant(state, state.asleep);
  const daysKnown = Math.max(1, Math.floor(daysBetween(Date.parse(pet.created_at), o.nowMs)) + 1);
  const level = levelFromExp(state.exp);
  const covered = careCoveredToday(state);

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
    needHint: needHint(state, covered),
    asleep: state.asleep,
    sprite: { creatureId: pet.species_id, stage: pet.stage, mood: dom.spriteMood, animation: dom.animation },
    careCharges: o.charges,
    chargesRefreshInMs: o.chargesRefreshInMs,
    dailyResetInMs: o.dailyResetInMs,
    careCoveredToday: covered,
    streakDays: cooldown.streak_days,
    theme: o.theme,
    voice: o.voice,
    actions: actionAvailability(pet.stage, state, o.charges, o.chargesRefreshInMs),
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
