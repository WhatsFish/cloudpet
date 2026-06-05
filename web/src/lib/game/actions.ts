// The verb pipeline (PLAN §5.8 / §8.3). Pure: given the (already tick-recomputed
// and daily-normalized) rows, validate the gates and produce a plan the route
// persists inside one FOR UPDATE transaction. Copy selection happens in the route.

import type { ItemKey, Snapshot, Stage, Verb } from "@/lib/types";
import { STATE } from "@/lib/types";
import type { BestiaryEntry } from "@/data/bestiary";
import { capForStage, stageDef } from "@/data/stage-table";
import { ACTIONS, OVERFEED, PET_EXP_DAILY_CAP, STREAK_EXP } from "./constants";
import { resolveStateFlags } from "./state";
import { rollDailyGift } from "./economy";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type CooldownRow = {
  last_feed: string | null; last_snack: string | null; last_clean: string | null;
  last_play: string | null; last_pet: string | null; last_sleep: string | null;
  last_doctor: string | null; last_checkin: string | null; last_reunion_gift: string | null;
  feed_count_day: number; snack_count_day: number; pet_count_day: number;
  daily_reset_on: string | null; streak_days: number;
  streak_state: "active" | "grace"; last_active_date: string | null;
};

const LAST_FIELD: Record<Verb, keyof CooldownRow> = {
  feed: "last_feed", snack: "last_snack", clean: "last_clean", play: "last_play",
  pet: "last_pet", sleep: "last_sleep", doctor: "last_doctor", checkin: "last_checkin",
};
const COUNTER_OF: Partial<Record<Verb, "feed_count_day" | "snack_count_day" | "pet_count_day">> = {
  feed: "feed_count_day", snack: "snack_count_day", pet: "pet_count_day",
};

export type ActionInput = {
  verb: Verb;
  petId: number;
  stage: Stage;
  state: Snapshot; // already tick-recomputed
  cooldown: CooldownRow; // already daily-normalized (counters 0 on a new local day)
  inventory: Record<ItemKey, number>;
  creature: BestiaryEntry;
  nowMs: number;
  localDate: string;
};

export type ActionReject = {
  ok: false;
  error: "locked" | "cooldown" | "unavailable" | "no_item";
  reason?: string;
  remainingMs?: number;
  flavorEvent?: string;
};

export type ActionPlan = {
  ok: true;
  state: Snapshot; // fully updated (effects + flags + sleep)
  expGain: number;
  bondGain: number;
  inventoryDelta: Partial<Record<ItemKey, number>>;
  cooldownSet: Partial<CooldownRow>;
  event: string; // copy event to render
  animation: string;
  rewards?: Partial<Record<ItemKey, number>>; // 签到 gift
  promoteHint: boolean; // exp changed → caller should re-check growth
};

function localDateOf(iso: string): string {
  return iso.slice(0, 10); // both are stored relative to same clock for same-day compare
}
function daysDiff(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

export function planAction(inp: ActionInput): ActionPlan | ActionReject {
  const { verb, stage, creature, nowMs, localDate, cooldown } = inp;
  const def = ACTIONS[verb];
  const s: Snapshot = { ...inp.state };
  const cap = capForStage(stage);

  // --- gates ---
  if (stageDef(stage).order < def.unlockOrder) {
    return { ok: false, error: "locked", reason: "still_young" };
  }
  if (def.blockedWhen?.includes("SICK") && s.state_flags & STATE.SICK) {
    return { ok: false, error: "unavailable", reason: "sick", flavorEvent: verb === "snack" ? "feed.sick_refuse" : "state.sick" };
  }
  if (def.blockedWhen?.includes("SULKING") && s.state_flags & STATE.SULKING) {
    return { ok: false, error: "unavailable", reason: "sulking", flavorEvent: "play.declined" };
  }
  if (def.oncePerDay && cooldown.last_checkin && localDateOf(cooldown.last_checkin) === localDate) {
    return { ok: false, error: "cooldown", reason: "checked_in_today" };
  }
  if (def.oncePerNight) {
    if (s.asleep) return { ok: false, error: "unavailable", reason: "already_sleeping" };
    if (cooldown.last_sleep && localDateOf(cooldown.last_sleep) === localDate) {
      return { ok: false, error: "cooldown", reason: "slept_today" };
    }
  }
  if (def.cooldownMs > 0) {
    const lastIso = cooldown[LAST_FIELD[verb]] as string | null;
    if (lastIso) {
      const rem = def.cooldownMs - (nowMs - Date.parse(lastIso));
      if (rem > 0) return { ok: false, error: "cooldown", remainingMs: rem };
    }
  }
  const counter = COUNTER_OF[verb];
  if (def.daily && counter && cooldown[counter] >= def.daily.max) {
    return { ok: false, error: "cooldown", reason: "daily_cap" };
  }
  if (def.cost && (inp.inventory[def.cost.item] ?? 0) < def.cost.qty) {
    return { ok: false, error: "no_item", reason: def.cost.item };
  }

  // --- apply effects ---
  let event = def.intent;
  let moodAdj = 0;

  // feed: diminishing return + mood dip when already full
  let satietyDelta = def.effects.satiety ?? 0;
  if (verb === "feed") {
    if (s.satiety > OVERFEED.aboveSatiety) {
      satietyDelta = OVERFEED.satietyGain;
      moodAdj -= OVERFEED.moodPenalty;
      event = "feed.overfed";
    } else {
      event = "feed.love";
    }
  }
  if (verb === "snack") event = "feed.love";

  for (const [k, v] of Object.entries(def.effects) as [keyof Snapshot, number][]) {
    let delta = v;
    if (k === "satiety") {
      delta = satietyDelta;
      if (verb === "feed" || verb === "snack") delta = Math.round(delta * creature.feed.satietyMult);
    }
    (s[k] as number) = clamp((s[k] as number) + delta, 0, cap);
  }

  // feeding mood bonus (archetype tilt) + any overfeed penalty
  if (verb === "feed" || verb === "snack") moodAdj += creature.feed.moodBonus;
  if (moodAdj !== 0) s.mood = clamp(s.mood + moodAdj, 0, cap);

  // sleep
  if (verb === "sleep") {
    s.asleep = true;
    s.sleep_since = new Date(nowMs).toISOString();
  }

  // exp / bond (pet EXP is capped per day)
  let expGain = def.exp;
  if (verb === "pet" && cooldown.pet_count_day * def.exp >= PET_EXP_DAILY_CAP) expGain = 0;
  const bondGain = def.bond;

  // cooldown / counters
  const cooldownSet: Partial<CooldownRow> = {
    [LAST_FIELD[verb]]: new Date(nowMs).toISOString(),
  } as Partial<CooldownRow>;
  if (def.daily && counter) {
    (cooldownSet[counter] as number) = cooldown[counter] + 1;
  }

  // check-in: streak + deterministic gift + milestone bonus
  let rewards: Partial<Record<ItemKey, number>> | undefined;
  const inventoryDelta: Partial<Record<ItemKey, number>> = {};
  if (def.cost) inventoryDelta[def.cost.item] = -def.cost.qty;

  if (verb === "checkin") {
    let streak = cooldown.streak_days;
    if (cooldown.last_active_date !== localDate) {
      const gap = cooldown.last_active_date ? daysDiff(cooldown.last_active_date, localDate) : 999;
      if (gap === 1) streak = cooldown.streak_days + 1;
      else streak = Math.max(1, Math.floor(cooldown.streak_days / 2) + 1);
    }
    cooldownSet.streak_days = streak;
    cooldownSet.streak_state = "active";
    cooldownSet.last_active_date = localDate;
    if (streak === 7) expGain += STREAK_EXP.day7;
    if (streak === 30) expGain += STREAK_EXP.day30;
    rewards = rollDailyGift(inp.petId, localDate, streak);
    for (const [k, v] of Object.entries(rewards) as [ItemKey, number][]) {
      inventoryDelta[k] = (inventoryDelta[k] ?? 0) + v;
    }
  }

  s.exp += expGain;
  s.bond = clamp(s.bond + bondGain, 0, 1000);

  // re-resolve flags — an interaction just happened, so idle-time states clear
  s.state_flags = resolveStateFlags(s, { noInteractionH: 0, lonelyAfterH: creature.lonelyAfterHours });
  s.last_tick = new Date(nowMs).toISOString();

  const animation = ANIM[verb] ?? "react_happy";
  return { ok: true, state: s, expGain, bondGain, inventoryDelta, cooldownSet, event, animation, rewards, promoteHint: expGain > 0 };
}

const ANIM: Record<Verb, string> = {
  feed: "eat_happy", snack: "eat_happy", clean: "react_happy", play: "react_happy",
  pet: "react_happy", sleep: "sleep", doctor: "react_happy", checkin: "react_happy",
};
