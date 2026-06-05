// Service layer: load the pet rows, run the compute-on-read tick, and assemble
// the view models + copy context. Shared by GET /api/pet and POST /api/action
// (the action route runs these reads inside a FOR UPDATE transaction).

import type { Tx } from "@/lib/db";
import { query } from "@/lib/db";
import type {
  ActionAvailability, CopyContext, Inventory, ItemKey, PetRow, PetView, Snapshot, Stage, Verb,
} from "@/lib/types";
import { creature } from "@/data/bestiary";
import { capForStage, expForNextStage, stageDef } from "@/data/stage-table";
import { ACTIONS } from "@/lib/game/constants";
import { recompute } from "@/lib/game/tick";
import { badges, dominant, moodBand } from "@/lib/game/state";
import { daysBetween, localDateStr, timeBand } from "@/lib/game/time";
import type { CooldownRow } from "@/lib/game/actions";

export type Rows = {
  pet: PetRow;
  state: Snapshot;
  cooldown: CooldownRow;
  inventory: Inventory;
};

const ITEM_KEYS: ItemKey[] = ["kibble", "snack", "soap", "heart"];

const PET_COLS =
  "id, user_id, archetype_key, species_id, name, stage, created_at::text AS created_at";
const STATE_COLS =
  "satiety, mood, cleanliness, energy, health, bond, exp::int AS exp, " +
  "last_tick::text AS last_tick, state_flags, state_since::text AS state_since, " +
  "asleep, sleep_since::text AS sleep_since";
const CD_COLS =
  "last_feed::text, last_snack::text, last_clean::text, last_play::text, last_pet::text, " +
  "last_sleep::text, last_doctor::text, last_checkin::text, last_reunion_gift::text, " +
  "feed_count_day, snack_count_day, pet_count_day, daily_reset_on::text AS daily_reset_on, " +
  "streak_days, streak_state, last_active_date::text AS last_active_date";

/** Load pet + state + cooldown + inventory. `forUpdate` locks state+cooldown (tx only). */
export async function loadRows(
  q: Tx,
  userId: string,
  forUpdate = false,
): Promise<Rows | null> {
  const lock = forUpdate ? " FOR UPDATE" : "";
  const pets = await q<PetRow>(`SELECT ${PET_COLS} FROM pet WHERE user_id = $1`, [userId]);
  const pet = pets[0];
  if (!pet) return null;

  const states = await q<Snapshot>(`SELECT ${STATE_COLS} FROM pet_state WHERE pet_id = $1${lock}`, [pet.id]);
  const cds = await q<CooldownRow>(`SELECT ${CD_COLS} FROM pet_cooldown WHERE pet_id = $1${lock}`, [pet.id]);
  const inv = await q<{ item_key: ItemKey; qty: number }>(
    `SELECT item_key, qty FROM pet_inventory WHERE pet_id = $1`, [pet.id],
  );

  const inventory = { kibble: 0, snack: 0, soap: 0, heart: 0 } as Inventory;
  for (const r of inv) inventory[r.item_key] = r.qty;

  return { pet, state: states[0], cooldown: cds[0], inventory };
}

export function lastInteractionMs(pet: PetRow, cd: CooldownRow): number {
  const times = [
    cd.last_feed, cd.last_snack, cd.last_clean, cd.last_play, cd.last_pet,
    cd.last_sleep, cd.last_doctor, cd.last_checkin, pet.created_at,
  ].filter(Boolean) as string[];
  return times.reduce((m, t) => Math.max(m, Date.parse(t)), 0);
}

/** Reset the per-day counters if they belong to a previous local day. */
export function normalizeDaily(cd: CooldownRow, localDate: string): { cd: CooldownRow; changed: boolean } {
  if (cd.daily_reset_on === localDate) return { cd, changed: false };
  return {
    cd: { ...cd, feed_count_day: 0, snack_count_day: 0, pet_count_day: 0, daily_reset_on: localDate },
    changed: true,
  };
}

/** Run the tick and persist the new snapshot (+ stage on promotion). Returns updated rows. */
export async function tickAndPersistTz(
  q: Tx, rows: Rows, nowMs: number, tzOffsetMin: number,
): Promise<{ rows: Rows; promoted: Stage | null }> {
  const c = creature(rows.pet.species_id);
  const out = recompute({
    s: rows.state,
    stage: rows.pet.stage,
    createdAtMs: Date.parse(rows.pet.created_at),
    tzOffsetMin,
    lastInteractionMs: lastInteractionMs(rows.pet, rows.cooldown),
    creature: c,
    nowMs,
  });
  return persistTick(q, rows, out.s, out.stage, out.promoted, nowMs);
}

async function persistTick(
  q: Tx, rows: Rows, s: Snapshot, stage: Stage, promoted: Stage | null, _nowMs: number,
): Promise<{ rows: Rows; promoted: Stage | null }> {
  await q(
    `UPDATE pet_state SET satiety=$2, mood=$3, cleanliness=$4, energy=$5, health=$6,
       bond=$7, exp=$8, last_tick=$9, state_flags=$10, state_since=$11, asleep=$12,
       sleep_since=$13, updated_at=NOW() WHERE pet_id=$1`,
    [rows.pet.id, s.satiety, s.mood, s.cleanliness, s.energy, s.health, s.bond, s.exp,
     s.last_tick, s.state_flags, s.state_since, s.asleep, s.sleep_since],
  );
  if (promoted) await q(`UPDATE pet SET stage=$2 WHERE id=$1`, [rows.pet.id, stage]);
  return { rows: { ...rows, pet: { ...rows.pet, stage }, state: s }, promoted };
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
  const noInteractionH = Math.max(0, (nowMs - lastInteractionMs(pet, cooldown)) / 3600000);
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

function cooldownRemaining(verb: Verb, cd: CooldownRow, nowMs: number): number {
  const def = ACTIONS[verb];
  if (def.cooldownMs <= 0) return 0;
  const field = (`last_${verb}` as keyof CooldownRow);
  const iso = cd[field] as string | null;
  if (!iso) return 0;
  return Math.max(0, def.cooldownMs - (nowMs - Date.parse(iso)));
}

export function actionAvailability(rows: Rows, nowMs: number, localDate: string): ActionAvailability[] {
  const { pet, state, inventory } = rows;
  const { cd } = normalizeDaily(rows.cooldown, localDate);
  const order = stageDef(pet.stage).order;
  const out: ActionAvailability[] = [];

  for (const verb of Object.keys(ACTIONS) as Verb[]) {
    const def = ACTIONS[verb];
    let enabled = true;
    let reason: string | undefined;
    let remainingMs: number | undefined;

    if (order < def.unlockOrder) { enabled = false; reason = "locked"; }
    else if (def.blockedWhen?.includes("SICK") && state.state_flags & 1) { enabled = false; reason = "sick"; }
    else if (def.blockedWhen?.includes("SULKING") && state.state_flags & 2) { enabled = false; reason = "sulking"; }
    else if (def.oncePerDay && cd.last_checkin && cd.last_checkin.slice(0, 10) === localDate) { enabled = false; reason = "done_today"; }
    else if (def.oncePerNight && (state.asleep || (cd.last_sleep && cd.last_sleep.slice(0, 10) === localDate))) { enabled = false; reason = state.asleep ? "sleeping" : "done_today"; }
    else if (def.cost && (inventory[def.cost.item] ?? 0) < def.cost.qty) { enabled = false; reason = "no_item"; }
    else {
      const rem = cooldownRemaining(verb, cd, nowMs);
      if (rem > 0) { enabled = false; reason = "cooldown"; remainingMs = rem; }
      else if (def.daily) {
        const counter = (`${verb}_count_day` as keyof CooldownRow);
        if ((cd[counter] as number) >= def.daily.max) { enabled = false; reason = "daily_cap"; }
      }
    }
    out.push({ verb, enabled, reason, remainingMs });
  }
  return out;
}

export function buildPetView(
  rows: Rows,
  nowMs: number,
  localDate: string,
  voice: { line: string; lineId: string } | null,
): PetView {
  const { pet, state, cooldown, inventory } = rows;
  const c = creature(pet.species_id);
  const dom = dominant(state, state.asleep);
  const daysKnown = Math.max(1, Math.floor(daysBetween(Date.parse(pet.created_at), nowMs)) + 1);

  return {
    pet: { id: pet.id, name: pet.name, archetypeKey: pet.archetype_key, stage: pet.stage, daysKnown },
    stats: {
      satiety: state.satiety, mood: state.mood, cleanliness: state.cleanliness,
      energy: state.energy, health: state.health,
    },
    bond: state.bond,
    exp: state.exp,
    expForNextStage: expForNextStage(pet.stage),
    moodBand: moodBand(state.mood),
    dominantState: dom.stateName,
    badges: badges(state, state.asleep),
    asleep: state.asleep,
    sprite: { creatureId: pet.species_id, stage: pet.stage, mood: dom.spriteMood, animation: dom.animation },
    inventory,
    streakDays: cooldown.streak_days,
    voice,
    actions: actionAvailability(rows, nowMs, localDate),
  };
}

/** Ensure today's 心声 exists (lazy create), return it. Safe to call repeatedly. */
export async function ensureDailyVoice(
  rows: Rows, ctx: CopyContext, localDate: string,
  build: () => { text: string; lineId: string },
): Promise<{ line: string; lineId: string }> {
  const existing = await query<{ line: string; line_id: string }>(
    `SELECT line, line_id FROM voice_log WHERE pet_id=$1 AND local_date=$2`,
    [rows.pet.id, localDate],
  );
  if (existing[0]) return { line: existing[0].line, lineId: existing[0].line_id };

  const built = build();
  await query(
    `INSERT INTO voice_log (pet_id, local_date, line, line_id, context)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (pet_id, local_date) DO NOTHING`,
    [rows.pet.id, localDate, built.text, built.lineId, JSON.stringify({ streak: ctx.streakDays })],
  );
  const again = await query<{ line: string; line_id: string }>(
    `SELECT line, line_id FROM voice_log WHERE pet_id=$1 AND local_date=$2`,
    [rows.pet.id, localDate],
  );
  return again[0] ? { line: again[0].line, lineId: again[0].line_id } : { line: built.text, lineId: built.lineId };
}
